import logging
import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from .merchant_constants import INTERNAL_TRANSFER_ACCOUNT_TO_OFFSET

logger = logging.getLogger(__name__)

# Set of all internal account numbers (both 11 and 12-digit versions) for fast lookup
_INTERNAL_ACCOUNTS_SET = frozenset(INTERNAL_TRANSFER_ACCOUNT_TO_OFFSET.keys())
_PRIME_ACCOUNTS = frozenset({"011010232800", "11010232800"})
_ACCOUNT_PATTERN = re.compile(r'\b(0?\d{11})\b')


def _detect_inter_account_transfer(description: str):
    """
    Detect if this is an inter-account transfer between our internal accounts.
    Returns:
        ('50-000001', 0)  if Prime Medical (011010232800) is involved with another company
        ('M11599', 0)     if two accounts from DIFFERENT companies appear (FROM/TO)
        (offset, 2)       if two accounts from the SAME company appear (intra-company)
        (None, None)      if not an inter-account transfer (< 2 internal accounts found)
    """
    # Find all 11-12 digit numbers in the description
    found_numbers = _ACCOUNT_PATTERN.findall(description)
    # Normalize each found number: check both with and without leading zero
    internal_found = set()
    for num in found_numbers:
        if num in _INTERNAL_ACCOUNTS_SET:
            internal_found.add(num)
        stripped = num.lstrip('0')
        if stripped in _INTERNAL_ACCOUNTS_SET:
            internal_found.add(num if num in _INTERNAL_ACCOUNTS_SET else stripped)

    # Need at least 2 internal account numbers to be any kind of inter-account transfer
    if len(internal_found) < 2:
        return None, None

    # If Prime Medical is one of the accounts → 50-000001, type 2
    if internal_found & _PRIME_ACCOUNTS:
        return "50-000001", 2

    # Any other inter-account transfer → M11599, type 0
    return "M11599", 0



# ─────────────────────────────────────────────────────────────────────────────
# Warba Polyclinics — Bank Account Mapping (from warbaConstants.ts)
# ─────────────────────────────────────────────────────────────────────────────

WARBA_BANK_INFO = {
    "AL ASEEL INTERNATIONAL POLYCLINIC": {"accountNo": "WTAA-61012", "activities": "1194", "propertyId": "CLO3"},
    "IRIS POLYCLINIC":                   {"accountNo": "WRIR-73018", "activities": "1193", "propertyId": "CLO3"},
    "YARROW POLYCLINIC":                 {"accountNo": "WRYR-67011", "activities": "1198", "propertyId": "CLO3"},
    "MEWL POLYCLINIC":                   {"accountNo": "KIBML-6601", "activities": "1205", "propertyId": "CLO4"},
    "FOURTH MEDICAL CENTER":             {"accountNo": "WRFM-55018", "activities": "1195", "propertyId": "CLO5"},
    "JOYA POLYCLINIC":                   {"accountNo": "WRJY-10018", "activities": "1197", "propertyId": "CLO6"},
    "MEDICAL HARBOUR CENTER":            {"accountNo": "WRMH-86019", "activities": "1196", "propertyId": "CLO6"},
    "MED MARINE POLYCLINIC":             {"accountNo": "WRMM-42013", "activities": "1191", "propertyId": "CLO6"},
    "MED GRAY POLYCLINIC":               {"accountNo": "WRMG-77018", "activities": "1192", "propertyId": "CLO7"},
    "ARAM MEDICAL POLYCLINIC":           {"accountNo": "WRAM-95018", "activities": "1199", "propertyId": "CLO8"},
    "TRI CARE CLINIC":                   {"accountNo": "WRTR-54019", "activities": "1211", "propertyId": "CLO8"},
}

VENDOR_OFFSET_ACCOUNTS = {
    "AL ASEEL INTERNATIONAL POLYCLINIC": "50-000010",
    "IRIS POLYCLINIC":                   "50-000004",
    "YARROW POLYCLINIC":                 "50-000005",
    "MEWL POLYCLINIC":                   "50-000011",
    "FOURTH MEDICAL CENTER":             "50-000009",
    "JOYA POLYCLINIC":                   "50-000002",
    "MEDICAL HARBOUR CENTER":            "50-000008",
    "MED MARINE POLYCLINIC":             "50-000006",
    "MED GRAY POLYCLINIC":               "50-000003",
    "ARAM MEDICAL POLYCLINIC":           "50-000007",
    "TRI CARE CLINIC":                   "50-000012",
    "Warba Medical Polyclinic":          "60-000001",
}

# ─────────────────────────────────────────────────────────────────────────────
# Category → Offset Account Mapping
# ─────────────────────────────────────────────────────────────────────────────

CATEGORY_TO_ACCOUNT = {
    "Bank Charges":        "65-000001",
    "POS Revenue":         "40-000001",
    "Accounts Receivable": "12-000001",
    "Accounts Payable":    "21-000001",
    "Cash Withdrawal":     "10-000002",
    "Salary Expense":      "62-000001",
    "Rent Expense":        "63-000001",
    "Utilities Expense":   "64-000001",
    "Medical Supplies":    "61-000001",
    "Office Supplies":     "61-000002",
    "Insurance Expense":   "66-000001",
    "Government Fees":     "67-000001",
    "Transfer In":         "10-000003",
    "Transfer Out":        "10-000003",
    "Loan Payment":        "22-000001",
    "Other Income":        "49-000001",
    "Other Expense":       "69-000001",
}

REQUIRED_TXN_FIELDS = ("date", "description", "amount", "type")


def _normalize(text: str) -> str:
    """Normalize an entity name for robust matching (case + whitespace)."""
    return " ".join(str(text or "").lower().split())


def _resolve_bank_info(account_name: str) -> Tuple[Optional[str], Optional[Dict[str, str]]]:
    """
    Resolve a bank account number for a given account name.

    Matching strategy (in order):
        1. Exact normalized match
        2. Full containment (only when the shorter name is at least 4 chars
           and not just a noisy common prefix like 'med' or 'polyclinic')

    Returns:
        (account_number, bank_info_dict) or (None, None) if no match.
    """
    if not account_name:
        return None, None

    target = _normalize(account_name)
    if not target:
        return None, None

    # 1) Exact normalized match
    for name, info in WARBA_BANK_INFO.items():
        if _normalize(name) == target:
            return info["accountNo"], info

    # 2) Containment match (with a min-length guard to avoid noisy matches)
    MIN_LEN = 4
    for name, info in WARBA_BANK_INFO.items():
        n_name = _normalize(name)
        if len(n_name) < MIN_LEN or len(target) < MIN_LEN:
            continue
        if n_name in target or target in n_name:
            return info["accountNo"], info

    return None, None


def _coerce_amount(raw: Any) -> Optional[float]:
    """
    Safely coerce a transaction amount to a positive float.

    Returns None when the value is missing, non-numeric, or non-positive.
    """
    if raw is None:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    # Treat near-zero as invalid for journal entries
    if value <= 0:
        return None
    return value


def _coerce_date(raw: Any) -> Optional[str]:
    """
    Normalize a transaction date to a `YYYY-MM-DD` string.

    Returns None if the value cannot be parsed.
    """
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    if isinstance(raw, str) and raw.strip():
        # Best-effort: pandas can parse many common formats
        try:
            ts = pd.to_datetime(raw, errors="raise")
            return ts.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            return None
    try:
        ts = pd.to_datetime(raw, errors="raise")
        return ts.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return None


def _build_entry(
    *,
    line_num: int,
    date: str,
    desc: str,
    category: str,
    amount: float,
    txn_type: str,
    bank_account: str,
    offset_account: str,
) -> Dict[str, Any]:
    """Build a single journal entry dict. Centralized to keep both branches consistent."""
    invoice_no = f"INV-{date.replace('-', '')}-{line_num}"

    if txn_type == "credit":
        return {
            "journalName": "CRNOTE",
            "journalNumber": 0,
            "lineNum": line_num,
            "numberOfVoucher": line_num,
            "postingDate": date,
            "documentDate": date,
            "description": f"{desc} [{category}]",
            "voucher": f"V-{line_num}",
            "accountType": "Bank",
            "account": bank_account,
            "debit": amount,
            "credit": 0.0,
            "offsetAccountType": "Ledger",
            "offsetAccount": offset_account,
            "invoiceNo": invoice_no,
            "currency": "KD",
            "category": category,
        }

    # Default branch: withdrawal / debit
    return {
        "journalName": "STVINV",
        "journalNumber": 0,
        "lineNum": line_num,
        "numberOfVoucher": line_num,
        "postingDate": date,
        "documentDate": date,
        "description": f"{desc} [{category}]",
        "voucher": f"V-{line_num}",
        "accountType": "Ledger",
        "account": offset_account,
        "debit": amount,
        "credit": 0.0,
        "offsetAccountType": "Bank",
        "offsetAccount": bank_account,
        "invoiceNo": invoice_no,
        "currency": "KD",
        "category": category,
    }


def generate_journal_entries(extracted_data: dict) -> list:
    """
    Generate IFRS-compliant journal entries from categorized transactions.

    Each transaction is pre-categorized by the categorizer module
    (rules engine + AI fallback). Currency: KD (Kuwaiti Dinar).

    Robustness notes:
        * Skips transactions with missing or invalid fields (logs a warning)
            instead of raising — partial output is better than total failure
            for a batch import.
        * Unknown categories fall back to "Other Expense" / "69-000001".
        * Bank account is auto-resolved from `accountName` against
            `WARBA_BANK_INFO` (with safer containment matching).
    """
    if not isinstance(extracted_data, dict):
        logger.error("generate_journal_entries: expected dict, got %s", type(extracted_data).__name__)
        return []

    account_name = extracted_data.get("accountName") or "Unknown"
    transactions = extracted_data.get("transactions") or []

    if not transactions:
        return []

    # Resolve the bank account number, falling back to whatever was provided.
    resolved_account, _ = _resolve_bank_info(account_name)
    account_number = resolved_account or extracted_data.get("accountNumber") or "Unknown"

    if resolved_account is None and account_name and account_name != "Unknown":
        logger.warning(
            "No bank info match for account name %r; using accountNumber=%r",
            account_name,
            account_number,
        )

    journal_entries: List[Dict[str, Any]] = []
    skipped = 0
    total_debit = 0.0

    # itertuples is materially faster than iterrows and gives us attribute access.
    for row in transactions:
        # Validate required fields first
        if not isinstance(row, dict):
            skipped += 1
            logger.warning("Skipping transaction: not a dict (%r)", row)
            continue
        missing = [f for f in REQUIRED_TXN_FIELDS if f not in row]
        if missing:
            skipped += 1
            logger.warning("Skipping transaction missing fields %s: %r", missing, row)
            continue

        date = _coerce_date(row.get("date"))
        if date is None:
            skipped += 1
            logger.warning("Skipping transaction with invalid date: %r", row)
            continue

        amount = _coerce_amount(row.get("amount"))
        if amount is None:
            skipped += 1
            logger.warning("Skipping transaction with non-positive/invalid amount: %r", row)
            continue

        desc = str(row.get("description") or "").strip()
        if not desc or desc == "(no description)" or "unknown transaction" in desc.lower():
            skipped += 1
            logger.info("Skipping unknown/unmatched transaction: %r", row)
            continue

        # User does NOT want "merchant rcon pay" lines journaled — skip them.
        if "merchant rcon pay" in desc.lower():
            skipped += 1
            logger.info("Skipping 'merchant rcon pay' transaction: %r", row)
            continue
        txn_type = str(row.get("type") or "").strip().lower()
        category = str(row.get("category") or "Other Expense")
        offset_account = CATEGORY_TO_ACCOUNT.get(category, "69-000001")

        # Override offset account based on description content
        # Use the inter-account transfer detector (requires 2 internal account numbers in desc)
        inter_offset, inter_type = _detect_inter_account_transfer(desc)
        if inter_offset:
            offset_account = inter_offset
        elif "saving account profit" in desc.lower():
            offset_account = "M52708"
        # Otherwise → category default (already set above)

        line_num = len(journal_entries) + 1
        try:
            entry = _build_entry(
                line_num=line_num,
                date=date,
                desc=desc,
                category=category,
                amount=amount,
                txn_type=txn_type,
                bank_account=account_number,
                offset_account=offset_account,
            )
        except Exception:
            skipped += 1
            logger.exception("Failed to build journal entry for row: %r", row)
            continue

        journal_entries.append(entry)
        total_debit += float(entry.get("debit", 0.0) or 0.0)

    if skipped:
        logger.info(
            "generate_journal_entries: produced %d entries (skipped %d invalid), total debit=%.3f KD",
            len(journal_entries),
            skipped,
            total_debit,
        )
    else:
        logger.info(
            "generate_journal_entries: produced %d entries, total debit=%.3f KD",
            len(journal_entries),
            total_debit,
        )

    return journal_entries