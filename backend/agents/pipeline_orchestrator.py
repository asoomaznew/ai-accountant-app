import logging
import os
import re
from typing import List, Dict, Any, Union

from .extraction_agent import ExtractionAgent
from .ai_parsing_agent import AIParsingAgent
from .cleansing_agent import CleansingAgent
from .accounting_agent import AccountingAgent
from .export_agent import ExportAgent
from .merchant_rules import extract_kib_aseel
from .smart_merchant_parser import SmartMerchantParser
from services.ocr_engine import OCREngine
from services.ai_enrichment_engine import AIEnrichmentEngine

# Configurable merchant filename → account-name mapping.
# Centralised here (module-level) so new merchants are added without touching
# the orchestration logic. Each key is matched as a substring of the lowercased
# filename.
MERCHANT_ACCOUNT_MAP: Dict[str, str] = {
    "aseel": "AL ASEEL INTERNATIONAL POLYCLINIC",
    "aram": "ARAM CLINIC",
    "yarrow": "YARROW POLYCLINIC",
    "fourth": "FOURTH CLINIC",
    "joya": "JOYA CLINIC",
    "med": "MED CLINIC",
    "iris": "IRIS CLINIC",
    "tri care": "TRI CARE CLINIC",
}

logger = logging.getLogger(__name__)


class SupervisorAgent:

    def __init__(self):
        self.extractor = ExtractionAgent()
        self.parser = AIParsingAgent()
        self.cleanser = CleansingAgent()
        self.accountant = AccountingAgent()
        self.exporter = ExportAgent()

    def _get_merchant_account_name(self, filename: str) -> str:
        filename_lower = filename.lower()
        for key, value in MERCHANT_ACCOUNT_MAP.items():
            if key in filename_lower:
                return value
        return os.path.splitext(filename)[0].replace('_', ' ').replace('-', ' ').title()

    async def process_file_to_entries(self, file_path: str, filename: str, job_type: str = "bank", raw_only: bool = False) -> Union[List[Dict[str, Any]], Dict[str, Any]]:
        logger.info(f"SupervisorAgent: Orchestrating pipeline for {filename} (job_type: {job_type}, raw_only: {raw_only})")
        
        # 1. Extraction Agent (Pure text & table parsing)
        extracted = self.extractor.extract_text_and_tables(file_path, filename)
        raw_text = extracted["text"]
        
        # OCR Fallback if text is empty
        if not raw_text or not raw_text.strip():
            logger.info("SupervisorAgent: Text is empty. Triggering OCR Engine fallback.")
            ocr = OCREngine()
            raw_text = ocr.process(file_path)
            extracted["text"] = raw_text

        account_number = extracted["account_number"]
        
        parsed_data = {}
        
        # 2. AIParsing Agent / Local Parsing Engine
        if job_type == "merchant":
            logger.info("SupervisorAgent: Using Rules Engine for merchant job")
            account_name = self._get_merchant_account_name(filename)
            filename_lower = filename.lower()
            transactions = []
            
            KIB_KEYWORDS = [
                "aseel", "iris", "fourth", "joya", "med gray", "med marine",
                "med well", "medical harbour", "yarrow", "aram", "tri care",
                # Short aliases still matched but only after longer ones
                "medgray", "medmarine", "medwell", "harbour",
            ]
            is_kib = any(kib_name in filename_lower for kib_name in KIB_KEYWORDS)
            
            if filename_lower.endswith(('.csv', '.xlsx', '.xls')):
                logger.info("SupervisorAgent: Merchant file is tabular, using DataFrames.")
                parser = SmartMerchantParser()
                
                raw_txns = []
                dataframes = extracted.get("dataframes", {})
                if dataframes:
                    for sheet_name, df in dataframes.items():
                        txns = parser.extract_from_dataframe(df)
                        raw_txns.extend(txns)
                else:
                    raw_txns = parser.extract_from_text(raw_text)
                    
                if parser.account_number and parser.account_number != "N/A":
                    account_number = parser.account_number
                    
                for rt in raw_txns:
                    is_credit = rt.get("raw_credit") is not None
                    transactions.append({
                        "date": rt["raw_date"],
                        "description": rt["raw_desc"],
                        "amount": rt.get("raw_amount", "0"),
                        "type": "credit" if is_credit else "debit",
                        "accountNumber": rt.get("raw_account_number") or account_number
                    })
            elif is_kib and filename_lower.endswith('.pdf'):
                logger.info("SupervisorAgent: Using extract_kib_aseel")
                raw_txns = extract_kib_aseel(file_path)
                # Try to extract account number from raw text
                match = re.search(r'\n(\d{12})\b', raw_text)
                if match:
                    account_number = match.group(1)
                
                for rt in raw_txns:
                    is_credit = rt.get("raw_credit") is not None
                    transactions.append({
                        "date": rt["raw_date"],
                        "description": rt["raw_desc"],
                        "amount": rt["raw_amount"],
                        "type": "credit" if is_credit else "debit"
                    })
            else:
                logger.info("SupervisorAgent: Using SmartMerchantParser for PDF")
                parser = SmartMerchantParser()
                raw_txns = parser.extract_transactions(file_path)
                account_number = parser.account_number or account_number
                for rt in raw_txns:
                    is_credit = rt.get("raw_credit") is not None
                    transactions.append({
                        "date": rt["raw_date"],
                        "description": rt["raw_desc"],
                        "amount": rt.get("raw_amount", "0"),
                        "type": "credit" if is_credit else "debit"
                    })
            
            parsed_data = {
                "accountName": account_name,
                "accountNumber": account_number,
                "transactions": transactions
            }
        else:
            # For bank statements, we try to use LLM to parse accurately, falling back to local regex parser
            try:
                parsed_data = await self.parser.parse_transactions(
                    raw_text=raw_text,
                    account_name=os.path.splitext(filename)[0],
                    account_number=account_number,
                    file_path=file_path,
                )
            except Exception as e:
                logger.error(f"LLM parsing failed, falling back to local rules parser: {e}")
                parsed_data = parse_warba_statement(file_path, filename)

        # 3. Cleansing Agent (Sanitizing, currency symbols, float casting)
        cleansed_data = self.cleanser.cleanse_extracted_data(parsed_data)

        if raw_only:
            logger.info("SupervisorAgent: Returning raw cleansed data as requested")
            return cleansed_data

        # 4. Accounting Agent (Chart of accounts mapping, debit/credit logic)
        raw_journal_entries = self.accountant.generate_entries(cleansed_data, job_type=job_type)

        # 5. Export Agent (Rounding, formatting keys)
        final_entries = self.exporter.format_for_export(raw_journal_entries)

        # Filter out any entries with unknown transaction descriptions
        final_entries = [
            e for e in final_entries
            if e.get("description") and "unknown transaction" not in str(e.get("description")).lower()
        ]

        # 6. AI Enrichment Layer (deterministic keyword mapping; optional local Ollama enhancement)
        logger.info("SupervisorAgent: Triggering AI Enrichment Layer for narrative and account suggestions.")
        try:
            ai_enrichment = AIEnrichmentEngine()
            enrichment = ai_enrichment.enrich(raw_text, "BANK_STATEMENT" if job_type == "bank" else "INVOICE")
            
            # Correct suspense accounts using AI matching if applicable
            for line in final_entries:
                if enrichment.suggested_account_no and (line.get("account_no") == "999999" or line.get("account_no") == ""):
                    line["account_no"] = enrichment.suggested_account_no
        except Exception as e:
            logger.warning(f"SupervisorAgent: AI Enrichment Layer failed, continuing without enrichment: {e}")

        # Surface silent data loss: log warnings instead of inserting a dummy
        # entry (which would produce a blank row in the output Excel).
        dropped = cleansed_data.get("dropped_transactions", [])
        if dropped:
            reasons = sorted({d.get("reason", "unknown") for d in dropped})
            logger.warning(
                "SupervisorAgent: %d transaction(s) dropped during cleansing. Reasons: %s",
                len(dropped), reasons
            )

        # Final guard: remove any empty or malformed entries before returning
        # to ensure no blank rows appear in the Excel output.
        final_entries = [
            e for e in final_entries
            if isinstance(e, dict)
            and not e.get("_warnings")
            and (
                e.get("journalName") or e.get("postingDate") or e.get("date") or
                e.get("description") or e.get("debitAmount") or e.get("creditAmount") or
                e.get("debit") or e.get("credit")
            )
        ]

        return final_entries

