import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class ExportAgent:
    """
    Agent responsible for final formatting, ordering, and structuring
    of the journal entries list for API consumption or Excel exports.
    """
    def format_for_export(self, journal_entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        logger.info("ExportAgent: Formatting final output for export")
        formatted = []
        for entry in journal_entries:
            # Skip any special/meta entries (e.g. _warnings) or completely empty entries
            if not isinstance(entry, dict):
                continue
            if "_warnings" in entry:
                logger.warning("ExportAgent: Skipping _warnings entry: %s", entry.get("_warnings"))
                continue
            # Skip entries with no meaningful content
            has_content = (
                entry.get("journalName") or
                entry.get("postingDate") or entry.get("date") or
                entry.get("description") or
                entry.get("debit") or entry.get("credit") or
                entry.get("debitAmount") or entry.get("creditAmount")
            )
            if not has_content:
                logger.warning("ExportAgent: Skipping empty entry: %s", entry)
                continue

            if entry.get("is_merchant_fully_formatted"):
                # Clean up the flag and return the fully structured merchant entry
                clean_entry = dict(entry)
                clean_entry.pop("is_merchant_fully_formatted", None)
                formatted.append(clean_entry)
                continue

            # Bank statement entries: map from accounting_module format to frontend-compatible format.
            # accounting_module._build_entry returns: journalName, journalNumber, postingDate,
            # accountType, account, debit, credit, offsetAccountType, offsetAccount, etc.
            txn_type = str(entry.get("journalName", "")).upper()
            is_credit = (txn_type == "CRNOTE")

            raw_debit = entry.get("debit", 0.0) or 0.0
            raw_credit = entry.get("credit", 0.0) or 0.0
            try:
                raw_debit = round(float(raw_debit), 3)
            except (ValueError, TypeError):
                raw_debit = 0.0
            try:
                raw_credit = round(float(raw_credit), 3)
            except (ValueError, TypeError):
                raw_credit = 0.0

            formatted.append({
                "journalNumber": entry.get("journalNumber", 0),
                "journalName": entry.get("journalName", "STVINV"),
                "lineNum": entry.get("lineNum", 0),
                "numberOfVoucher": entry.get("numberOfVoucher", 0),
                "postingDate": entry.get("postingDate") or entry.get("date", ""),
                "accountType": 6,
                "accountNo": entry.get("account") or entry.get("accountNo") or entry.get("offsetAccount", ""),
                "description": entry.get("description", ""),
                "debitAmount": raw_debit if is_credit else "",
                "creditAmount": "" if is_credit else raw_credit,
                "currencyCode": entry.get("currency", "KWD"),
                "exchangeRate": 100,
                "offsetAccountType": entry.get("offsetAccountType", 2),
                "offsetAccount": entry.get("offsetAccount") or entry.get("account", ""),
                "documentNo": "",
                "documentDate": entry.get("documentDate") or entry.get("postingDate") or entry.get("date", ""),
                "dueDate": entry.get("dueDate") or entry.get("postingDate") or entry.get("date", ""),
                "assetTransType": "",
                "postingProfile": "Vend Post",
                "paymentMode": "",
                "paymentReference": "",
                "activities": entry.get("activities", "N/A"),
                "country": entry.get("country", "N/A"),
                "departments": entry.get("departments", "N/A"),
                "projectId": entry.get("projectId", "N/A"),
                "propertyId": entry.get("propertyId", "N/A"),
                "invoiceNo": entry.get("invoiceNo", ""),
            })
        return formatted
