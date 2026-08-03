import re
import pdfplumber
import logging
import pandas as pd
from typing import List, Dict, Any
from rapidfuzz import process, fuzz
from dateutil import parser as date_parser

logger = logging.getLogger(__name__)

class SmartMerchantParser:
    """
    Parser for extracting merchant/POS transactions from statements.
    """
    def __init__(self):
        self.account_number = "N/A"

    def extract_transactions(self, file_path: str) -> List[Dict[str, Any]]:
        logger.info(f"SmartMerchantParser: Extracting transactions from {file_path}")
        transactions = []
        date_pattern = re.compile(r'(\d{1,2})[-/](\d{1,2})[-/](\d{4})')
        amount_pattern = re.compile(r'[\d,]+\.\d{2,3}')
        
        try:
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if not text:
                        continue
                    
                    # Try to locate account number
                    acc_match = re.search(r'\b(\d{12})\b', text)
                    if acc_match:
                        self.account_number = acc_match.group(1)
                        
                    for line in text.splitlines():
                        line = line.strip()
                        date_match = date_pattern.search(line)
                        if not date_match:
                            continue
                        
                        amounts = amount_pattern.findall(line)
                        if not amounts:
                            continue
                        
                        raw_date = date_match.group(0)
                        raw_amount = amounts[0].replace(',', '')
                        
                        date_idx = line.find(raw_date)
                        amount_idx = line.find(amounts[0])
                        
                        desc = line[date_idx + len(raw_date):amount_idx].strip(" -|:\t")
                        is_credit = any(kw in desc.lower() for kw in ["dep", "deposit", "refund", "credit", "incoming"])
                        
                        transactions.append({
                            "raw_date": raw_date,
                            "raw_desc": desc or "Merchant Transaction",
                            "raw_amount": raw_amount,
                            "raw_credit": raw_amount if is_credit else None
                        })
        except Exception as e:
            logger.error(f"Error in SmartMerchantParser: {e}")
            
        return transactions

    def extract_from_text(self, raw_text: str) -> List[Dict[str, Any]]:
        logger.info("SmartMerchantParser: Extracting transactions from tabular text")
        transactions = []
        date_pattern = re.compile(r'\b(?:\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b')
        amount_pattern = re.compile(r'\b\d{1,3}(?:,\d{3})*\.\d{1,3}\b|\b\d+\.\d{1,3}\b')
        
        try:
            for line in raw_text.splitlines():
                line = line.strip()
                date_match = date_pattern.search(line)
                if not date_match:
                    continue
                
                amounts = amount_pattern.findall(line)
                if not amounts:
                    continue
                
                raw_date = date_match.group(0)
                # Find all numbers that look like amounts
                # If tabular CSV text, it usually has Date, Desc, Amount, etc.
                raw_amount = amounts[0].replace(',', '')
                
                # Guess description
                # Replace the date and amounts from the line to get text
                desc = line
                desc = desc.replace(raw_date, '', 1)
                for amt in amounts:
                    desc = desc.replace(amt, '', 1)
                
                desc = re.sub(r'\s+', ' ', desc).strip(" -|:\t")
                is_credit = any(kw in desc.lower() for kw in ["dep", "deposit", "refund", "credit", "incoming", "knet", "pos"])
                
                transactions.append({
                    "raw_date": raw_date,
                    "raw_desc": desc or "Merchant Transaction",
                    "raw_amount": raw_amount,
                    "raw_credit": raw_amount if is_credit else None
                })
        except Exception as e:
            logger.error(f"Error in SmartMerchantParser extract_from_text: {e}")
            
        return transactions

    def extract_from_dataframe(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Smart extraction directly from a Pandas DataFrame using rapidfuzz for column matching
        and dateutil for parsing flexible dates.
        """
        logger.info("SmartMerchantParser: Extracting transactions from DataFrame")
        transactions = []
        
        if df.empty:
            return transactions
            
        # 1. Identify columns using rapidfuzz
        cols = [str(c).lower() for c in df.columns]
        
        def find_best_col(choices: List[str], available_cols: List[str], threshold: int = 80) -> str:
            for choice in choices:
                match = process.extractOne(choice, available_cols, scorer=fuzz.partial_ratio)
                if match and match[1] >= threshold:
                    return available_cols[available_cols.index(match[0])]
            return None

        # Check if current columns have date
        if not find_best_col(["date", "posting date", "transaction date"], cols):
            # Search first 20 rows for header
            for idx, row in df.head(20).iterrows():
                row_vals = [str(v).lower() for v in row.values]
                if find_best_col(["date", "posting date", "transaction date"], row_vals):
                    # Found header row! Re-assign columns
                    df.columns = [str(v) for v in row.values]
                    df = df.iloc[idx+1:].reset_index(drop=True)
                    cols = [str(c).lower() for c in df.columns]
                    logger.info(f"SmartMerchantParser: Found headers at row {idx}")
                    break

        # Re-run column identification with potentially new cols
        def get_orig_col(choices: List[str]) -> str:
            match = find_best_col(choices, cols)
            if match:
                return df.columns[cols.index(match)]
            return None

        date_col = get_orig_col(["date", "posting date", "transaction date"])
        desc_col = get_orig_col(["description", "particulars", "details", "narration", "remarks"])
        debit_col = get_orig_col(["debit", "withdrawal", "dr"])
        credit_col = get_orig_col(["credit", "deposit", "cr"])
        amount_col = get_orig_col(["net amount", "amount"])
        
        if not date_col:
            # Maybe the first row is actually the header (if read without header=0 but standard behavior uses first row)
            # Or this sheet doesn't contain transactions. We fallback to returning empty and letting caller check other sheets.
            logger.info("Could not identify a date column. Skipping dataframe.")
            return transactions

        # Extract account number if available in columns
        acc_col = get_orig_col(["account number", "account", "acc no", "acc"])
        if acc_col and self.account_number == "N/A":
            for _, row in df.iterrows():
                val = str(row.get(acc_col, "")).strip()
                if val and val.lower() not in ("nan", "nat", "none", ""):
                    # check if it looks like an account number (digits)
                    digits = re.sub(r'\D', '', val)
                    if len(digits) >= 8:
                        self.account_number = digits
                        logger.info(f"SmartMerchantParser: Extracted account number {self.account_number} from dataframe")
                        break

        # Iterate over rows
        for _, row in df.iterrows():
            raw_date = str(row.get(date_col, ""))
            if not raw_date or raw_date.lower() in ("nan", "nat", "none", ""):
                continue
                
            # Try parsing date to ensure it's a valid row
            try:
                parsed_date = date_parser.parse(raw_date, fuzzy=True, dayfirst=True)
                formatted_date = parsed_date.strftime("%d-%m-%Y")
            except Exception:
                continue # Not a valid transaction row

            # Description
            desc = ""
            if desc_col:
                desc = str(row.get(desc_col, "")).strip()
            
            if not desc or desc.lower() in ("nan", "none", ""):
                # Try to build description from POS specific columns if available
                trans_type = str(row.get("Trans Type", "")).strip()
                card_type = str(row.get("Card Type", "")).strip()
                if trans_type and trans_type.lower() != "nan":
                    desc = f"POS {trans_type} - {card_type}".strip(" -")
                else:
                    desc = "POS Settlement"
            
            # Per-row account number
            row_acc = self.account_number
            if acc_col:
                val = str(row.get(acc_col, "")).strip()
                if val and val.lower() not in ("nan", "nat", "none", ""):
                    digits = re.sub(r'\D', '', val)
                    if len(digits) >= 8:
                        row_acc = digits

            # Amount
            raw_amount = 0.0
            is_credit = False
            
            # Helper to clean numbers
            def clean_num(val):
                if pd.isna(val) or val is None:
                    return 0.0
                v = str(val).replace(',', '').replace('KD', '').replace('KWD', '').strip()
                try:
                    return float(v)
                except ValueError:
                    return 0.0

            if debit_col and credit_col:
                d_val = clean_num(row.get(debit_col))
                c_val = clean_num(row.get(credit_col))
                if c_val > 0:
                    raw_amount = c_val
                    is_credit = True
                elif d_val > 0:
                    raw_amount = d_val
                elif amount_col:
                    amt = clean_num(row.get(amount_col))
                    raw_amount = abs(amt)
                    is_credit = amt > 0 # Assume positive is credit if it's a single col
            elif amount_col:
                amt = clean_num(row.get(amount_col))
                raw_amount = abs(amt)
                is_credit = amt > 0 # Or use description keywords
            
            # Fallback credit check based on description if we couldn't determine from columns
            if raw_amount > 0 and not is_credit and not (debit_col and credit_col):
                is_credit = any(kw in desc.lower() for kw in ["dep", "deposit", "refund", "credit", "incoming", "knet", "pos"])
            
            # Only add if amount > 0
            if raw_amount > 0:
                transactions.append({
                    "raw_date": formatted_date,
                    "raw_desc": desc,
                    "raw_amount": str(raw_amount),
                    "raw_credit": str(raw_amount) if is_credit else None,
                    "raw_account_number": row_acc
                })
                
        logger.info(f"SmartMerchantParser: Extracted {len(transactions)} transactions from DataFrame")
        return transactions

