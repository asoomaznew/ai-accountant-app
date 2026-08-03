# ─────────────────────────────────────────────────────────────────────────────
# modules/categorizer.py
# Smart AI Categorizer — يصنف العمليات الغامضة فقط
# يستخدم قواعد برمجية أولاً (Rules Engine)، ثم AI للباقي
# ─────────────────────────────────────────────────────────────────────────────

import json
import logging
from typing import Optional

from rapidfuzz import fuzz
from .llm_gateway import ask_llm

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Chart of Accounts — الحسابات المتاحة للتصنيف (IFRS / KD)
# ─────────────────────────────────────────────────────────────────────────────

ACCOUNT_CATEGORIES = {
    "Bank Charges":        "مصاريف بنكية - رسوم وعمولات البنك",
    "POS Revenue":         "إيرادات نقاط البيع - مبالغ واردة من أجهزة الدفع",
    "Accounts Receivable": "ذمم مدينة - مبالغ مستحقة من العملاء",
    "Accounts Payable":    "ذمم دائنة - مبالغ مستحقة للموردين",
    "Cash Withdrawal":     "سحب نقدي من الصراف أو البنك",
    "Salary Expense":      "مصاريف رواتب وأجور",
    "Rent Expense":        "مصاريف إيجار",
    "Utilities Expense":   "مصاريف خدمات (كهرباء، ماء، إنترنت)",
    "Medical Supplies":    "مستلزمات طبية",
    "Office Supplies":     "مستلزمات مكتبية",
    "Insurance Expense":   "مصاريف تأمين",
    "Government Fees":     "رسوم حكومية",
    "Transfer In":         "تحويل وارد",
    "Transfer Out":        "تحويل صادر",
    "Loan Payment":        "سداد قرض أو تمويل",
    "Other Income":        "إيرادات أخرى",
    "Other Expense":       "مصاريف أخرى",
}

# ─────────────────────────────────────────────────────────────────────────────
# Rules Engine — قواعد برمجية للتصنيف السريع (بدون AI)
# ─────────────────────────────────────────────────────────────────────────────

KEYWORD_RULES: list[tuple[list[str], str]] = [
    # Bank Charges — be specific: don't use bare 'fee' here
    (["bank fee", "chg", "charge", "commission", "dd/chg",
      "service charge", "maintenance fee", "swift chg"], "Bank Charges"),

    # POS Revenue
    (["pos", "knet", "point of sale", "card payment", "visa deposit",
      "mastercard", "benefit pay"], "POS Revenue"),

    # Cash / ATM
    (["atm", "cash withdrawal", "atm wdl", "cash dep"], "Cash Withdrawal"),

    # Transfers
    (["transfer in", "trf from", "incoming", "credit transfer",
      "ft cr", "standing order cr"], "Transfer In"),
    (["transfer out", "trf to", "outgoing", "ft dr",
      "standing order dr", "rtgs"], "Transfer Out"),

    # Salary
    (["salary", "payroll", "wages", "wps"], "Salary Expense"),

    # Rent
    (["rent", "lease", "tenancy"], "Rent Expense"),

    # Utilities
    (["electricity", "water", "internet", "telecom", "zain", "ooredoo",
      "stc", "mew", "moc"], "Utilities Expense"),

    # Government — must come BEFORE generic 'fee' to win on 'government fees'
    (["mof", "pam", "municipality", "civil id", "residency",
      "govt", "government", "license fee", "mosal", "government fee",
      "govt fee"], "Government Fees"),

    # Insurance
    (["insurance", "premium", "takaful"], "Insurance Expense"),

    # Loan
    (["loan", "installment", "murabaha", "finance", "emi"], "Loan Payment"),

    # Refund / Miscellaneous
    (["refund", "reversal", "returned"], "Other Income"),
]


def classify_by_rules(description: str) -> Optional[str]:
    """
    Try to classify a transaction using keyword rules with fuzzy matching.
    Returns the account category or None if ambiguous.
    """
    desc_lower = description.lower()
    
    # Track the best match above threshold
    best_score = 0
    best_category = None
    
    for keywords, category in KEYWORD_RULES:
        for kw in keywords:
            # First check exact substring (fastest)
            if kw in desc_lower:
                return category
                
            # Then check fuzzy matching
            # partial_ratio checks if kw is a substring of desc_lower even with typos
            score = fuzz.partial_ratio(kw, desc_lower)
            if score >= 85 and score > best_score:
                best_score = score
                best_category = category
                
    if best_score >= 85:
        return best_category
        
    return None  # غامضة — تحتاج AI


# ─────────────────────────────────────────────────────────────────────────────
# AI Categorizer — يرسل فقط العمليات الغامضة
# ─────────────────────────────────────────────────────────────────────────────

async def categorize_transactions(transactions: list[dict]) -> list[dict]:
    """
    Main entry point:
    1. Classifies clear transactions using rules (instant).
    2. Sends ONLY ambiguous ones to an optional local model (Ollama); otherwise uses a deterministic keyword fallback.
    3. Returns all transactions with 'category' field populated.
    """
    ambiguous = []
    ambiguous_indices = []

    for i, txn in enumerate(transactions):
        category = classify_by_rules(txn.get("description", ""))
        if category:
            txn["category"] = category
        else:
            txn["category"] = "Other Expense"  # Default
            ambiguous.append(txn)
            ambiguous_indices.append(i)

    total = len(transactions)
    classified_count = total - len(ambiguous)
    logger.info(
        f"📊 Rules Engine: classified {classified_count}/{total} transactions. "
        f"Ambiguous: {len(ambiguous)}"
    )

    # If there are ambiguous transactions, ask AI
    if ambiguous:
        try:
            ai_categories = await _ask_ai_for_categories(ambiguous)
            for idx, cat in zip(ambiguous_indices, ai_categories):
                if cat and cat in ACCOUNT_CATEGORIES:
                    transactions[idx]["category"] = cat
        except Exception as e:
            logger.warning(
                f"⚠️ AI categorization failed: {e}. "
                "Using 'Other Expense' for ambiguous transactions."
            )

    return transactions


# Keyword map used when no local model is available (deterministic fallback).
_KEYWORD_TO_CATEGORY = [
    ("rent", "Rent Expense"),
    ("lease", "Rent Expense"),
    ("salary", "Salary Expense"),
    ("wage", "Salary Expense"),
    ("utility", "Utilities Expense"),
    ("electric", "Utilities Expense"),
    ("water", "Utilities Expense"),
    ("sewa", "Utilities Expense"),
    ("dewa", "Utilities Expense"),
    ("insurance", "Insurance Expense"),
    ("medical", "Medical Supplies"),
    ("clinic", "Medical Supplies"),
    ("supply", "Office Supplies"),
    ("stationery", "Office Supplies"),
    ("government", "Government Fees"),
    ("fee", "Government Fees"),
    ("transfer in", "Transfer In"),
    ("inward", "Transfer In"),
    ("deposit", "Transfer In"),
    ("transfer", "Transfer Out"),
    ("withdrawal", "Cash Withdrawal"),
    ("loan", "Loan Payment"),
    ("pos", "POS Revenue"),
    ("knet", "POS Revenue"),
    ("sale", "POS Revenue"),
    ("invoice", "Accounts Receivable"),
    ("customer", "Accounts Receivable"),
    ("supplier", "Accounts Payable"),
    ("vendor", "Accounts Payable"),
    ("bank charge", "Bank Charges"),
    ("commission", "Bank Charges"),
    ("income", "Other Income"),
]


def _keyword_categorize(ambiguous_txns: list[dict]) -> list[str]:
    """Pure-Python categorization (no model). Maps description keywords to a
    known ACCOUNT_CATEGORIES name; defaults to 'Other Expense'."""
    out = []
    for txn in ambiguous_txns:
        desc = (txn.get("description") or "").lower()
        chosen = "Other Expense"
        for kw, cat in _KEYWORD_TO_CATEGORY:
            if kw in desc:
                chosen = cat
                break
        out.append(chosen)
    return out


async def _ask_ai_for_categories(ambiguous_txns: list[dict]) -> list[str]:
    """
    Build a minimal prompt with ONLY the ambiguous transactions
    and ask the AI to categorize them.
    """
    categories_list = "\n".join(
        f"- {name}: {desc}" for name, desc in ACCOUNT_CATEGORIES.items()
    )

    txn_lines = "\n".join(
        f'{i+1}. "{txn["description"]}" — {txn["amount"]} KD ({txn["type"]})'
        for i, txn in enumerate(ambiguous_txns)
    )

    prompt = f"""You are an expert accountant in Kuwait working under IFRS standards.
Classify each transaction below into ONE of these account categories:

{categories_list}

Transactions to classify:
{txn_lines}

Return a JSON object with a single key "categories" containing an array of category names,
one for each transaction, in the same order. Example:
{{"categories": ["Bank Charges", "POS Revenue", "Other Expense"]}}
"""

    try:
        raw = await ask_llm(prompt)
    except Exception as e:
        logger.warning(f"⚠️ Categorizer: model unavailable ({e}); using deterministic keyword fallback.")
        return _keyword_categorize(ambiguous_txns)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error(f"❌ AI returned invalid JSON: {exc}; raw={raw[:200]!r}")
        return []

    if not isinstance(data, dict):
        logger.error(f"❌ AI response is not a JSON object: {type(data).__name__}")
        return []

    categories = data.get("categories", [])
    if not isinstance(categories, list):
        logger.error(f"❌ AI 'categories' field is not a list: {type(categories).__name__}")
        return []

    # Filter to known category names to guard against prompt-injection / hallucination
    valid = [c for c in categories if isinstance(c, str) and c in ACCOUNT_CATEGORIES]
    if len(valid) != len(categories):
        logger.warning(
            f"⚠️ AI returned {len(categories) - len(valid)} unknown category name(s); "
            "they will fall back to 'Other Expense'."
        )
    return valid
