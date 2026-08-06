import re
import json
import logging
from typing import Dict, Any

# Deterministic (no-model) bank-statement parsers — primary path.
from modules.parser_module import parse_warba_statement
# KIB/IBAN layout parser — proven to extract from KIB statements (e.g. FOURTH MEDICAL).
from .merchant_rules import extract_kib_aseel
# SmartMerchantParser handles other KIB/IBAN layouts.
from .smart_merchant_parser import SmartMerchantParser
# Optional local-model enhancement (Ollama only; never cloud).
try:
    from modules.llm_gateway import call_ollama, ping_ollama
    _HAS_GATEWAY = True
except ImportError:
    _HAS_GATEWAY = False

logger = logging.getLogger(__name__)


def _from_smart_merchant(file_path: str) -> Dict[str, Any] | None:
    """Pure-Python fallback chain that already works on KIB/IBAN statements."""
    # KIB-specific parser first (proven on FOURTH MEDICAL IBAN files).
    try:
        kib = extract_kib_aseel(file_path)
        if kib:
            return {
                "accountName": "KIB Statement",
                "accountNumber": "N/A",
                "transactions": [
                    {
                        "date": t.get("raw_date", ""),
                        "description": t.get("raw_desc", ""),
                        "amount": float(t.get("raw_amount", 0) or 0),
                        "type": "credit" if t.get("raw_credit") is not None else "debit",
                    }
                    for t in kib
                ],
            }
    except Exception as e:
        logger.warning(f"AIParsingAgent: extract_kib_aseel fallback failed: {e}")

    # Generic smart merchant parser next.
    try:
        parser = SmartMerchantParser()
        txns = parser.extract_transactions(file_path)
        if txns:
            return {
                "accountName": parser.account_number or "N/A",
                "accountNumber": parser.account_number,
                "transactions": [
                    {
                        "date": t.get("raw_date", ""),
                        "description": t.get("raw_desc", ""),
                        "amount": float(t.get("raw_amount", 0) or 0),
                        "type": "credit" if t.get("raw_credit") is not None else "debit",
                    }
                    for t in txns
                ],
            }
    except Exception as e:
        logger.warning(f"AIParsingAgent: SmartMerchantParser fallback failed: {e}")
    return None


class AIParsingAgent:
    """
    Turns raw extracted text into a structured JSON of transactions.

    Design (per project requirement: minimize model dependence):
      - PRIMARY:  deterministic Python parsers (parse_warba_statement, then
                  SmartMerchantParser). Works with zero models configured.
      - OPTIONAL: if a local Ollama instance is reachable, we may use it to
                  *enhance* the parsed result. If Ollama is unavailable or errors,
                  we silently keep the deterministic result.
      - NO cloud calls are ever made from this agent.
    """

    async def parse_transactions(self, raw_text: str, account_name: str, account_number: str, file_path: str = "") -> Dict[str, Any]:
        # 1) Deterministic parse — always runs, no model needed.
        if file_path:
            try:
                parsed = parse_warba_statement(file_path, account_name)
                if parsed and parsed.get("transactions"):
                    return parsed
            except Exception as e:
                logger.warning(f"AIParsingAgent: deterministic parse failed: {e}")

            # 1b) Fallback to the merchant/KIB parser (pure Python, no model).
            fallback = _from_smart_merchant(file_path)
            if fallback and fallback.get("transactions"):
                return fallback

        # 2) If deterministic gave nothing, try an optional local-model enhancement
        #    (Ollama only). Never blocks the pipeline if unavailable.
        if _HAS_GATEWAY and await _safe_ping():
            try:
                logger.info("AIParsingAgent: using Ollama (local) as optional enhancement")
                llm_response = await call_ollama(self._build_prompt(raw_text, account_name, account_number))
                llm_response = re.sub(r"^```json\s*", "", llm_response)
                llm_response = re.sub(r"\s*```$", "", llm_response)
                return json.loads(llm_response.strip())
            except Exception as e:
                logger.warning(f"AIParsingAgent: Ollama enhancement failed, keeping deterministic: {e}")

        # 3) Minimal empty structure (deterministic already attempted above).
        return {
            "accountName": account_name,
            "accountNumber": account_number,
            "transactions": [],
        }

    # The orchestrator passes a file path via parse_transactions(file_path=...).

    def _build_prompt(self, raw_text: str, account_name: str, account_number: str) -> str:
        return (
            "You are an expert financial data extraction API.\n"
            f"Account holder: {account_name}.\n"
            f"Account Number: {account_number}.\n"
            "Extract ALL transactions (credit and debit). For each: date (YYYY-MM-DD), "
            "description, amount (positive number), type ('credit' or 'debit').\n"
            "Return ONLY a JSON object: "
            '{"accountName":"string","accountNumber":"string","transactions":'
            '[{"date":"YYYY-MM-DD","description":"string","amount":number,"type":"credit" or "debit"}]}\n\n'
            f"Document Text:\n---\n{raw_text[:80000]}\n---"
        )


async def _safe_ping() -> bool:
    try:
        return await ping_ollama()
    except Exception:
        return False
