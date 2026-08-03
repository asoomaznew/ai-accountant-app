import re
import logging
from typing import Dict, Any, List
from datetime import date
from dateutil import parser as date_parser
from pydantic import BaseModel, field_validator, ValidationError

logger = logging.getLogger(__name__)

class TransactionModel(BaseModel):
    date: str
    description: str
    amount: float
    type: str
    accountNumber: str | None = None

    @field_validator('amount')
    def check_amount(cls, v):
        if v < 0:
            return abs(v)
        return v

    @field_validator('type')
    def check_type(cls, v):
        val = str(v).lower().strip()
        if val not in ["credit", "debit"]:
            return "debit"
        return val

class CleansingAgent:
    """
    Agent responsible for sanitizing the output of LLM parsing.
    Cleans date formats, standardizes numbers, removes symbols, and ensures type compliance.
    """
    def standardize_date(self, date_str: str) -> str:
        if not date_str:
            return date_str
        
        date_str = str(date_str).strip().replace(' ', '')
        
        # Fast check for standard format
        if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            return date_str
            
        try:
            parsed = date_parser.parse(date_str, fuzzy=True, dayfirst=True)
            return parsed.strftime("%Y-%m-%d")
        except Exception:
            # Fallback
            match = re.match(r'^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$', date_str)
            if match:
                d, m, y = match.groups()
                return f"{y}-{int(m):02d}-{int(d):02d}"
            return date_str

    def clean(self, parsed_data: Dict[str, Any]) -> Dict[str, Any]:
        return self.cleanse_extracted_data(parsed_data)

    def cleanse_extracted_data(self, parsed_data: Dict[str, Any]) -> Dict[str, Any]:
        logger.info("CleansingAgent: Cleaning parsed transactions...")
        raw_txns = parsed_data.get("transactions", [])
        cleaned_transactions = []
        dropped_transactions = []

        for txn in raw_txns:
            date_val = txn.get("date")
            desc_val = txn.get("description")
            amt_val = txn.get("amount")
            type_val = txn.get("type", "debit")
            acc_val = txn.get("accountNumber")

            std_date = self.standardize_date(date_val)
            
            # Clean amount
            try:
                if isinstance(amt_val, str):
                    clean_amt_str = re.sub(r'[^\d.-]', '', amt_val)
                    amt = float(clean_amt_str) if clean_amt_str else 0.0
                else:
                    amt = float(amt_val) if amt_val is not None else 0.0
            except Exception:
                amt = 0.0

            clean_desc = str(desc_val).strip()
            if not clean_desc or clean_desc.lower() == "unknown transaction" or clean_desc.lower().startswith("unknown transaction"):
                dropped_transactions.append({**txn, "reason": "Unknown or missing transaction description"})
                continue

            try:
                # Validate with Pydantic
                valid_txn = TransactionModel(
                    date=std_date,
                    description=clean_desc,
                    amount=amt,
                    type=type_val,
                    accountNumber=str(acc_val).strip() if acc_val else None
                )
                
                # Exclude zero amount transactions to prevent empty ledger lines
                if valid_txn.amount > 0:
                    cleaned_transactions.append(valid_txn.model_dump())
                else:
                    dropped_transactions.append({**txn, "reason": "Zero amount"})
                    
            except ValidationError as e:
                logger.warning(f"Dropping invalid transaction: {e}")
                dropped_transactions.append({**txn, "reason": str(e)})
            
        return {
            "accountName": str(parsed_data.get("accountName", "Unknown")).strip(),
            "accountNumber": str(parsed_data.get("accountNumber", "N/A")).strip(),
            "transactions": cleaned_transactions,
            "dropped_transactions": dropped_transactions
        }
