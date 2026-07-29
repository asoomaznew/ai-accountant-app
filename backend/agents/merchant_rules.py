import re
import pdfplumber
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

def extract_kib_aseel(file_path: str) -> List[Dict[str, Any]]:
    """
    Parses a KIB statement PDF to extract raw transaction details.
    Handles both split layouts (where date, amount, and year are on separate lines)
    and single-line layouts (where date, amount, and balance are on one line).
    """
    logger.info(f"extract_kib_aseel: Extracting from {file_path}")
    transactions = []
    
    start_date_pattern = re.compile(r'^(\d{1,2}-\d{1,2}-)')
    full_date_pattern = re.compile(r'\b(\d{1,2}-\d{1,2}-\d{4})\b')
    amount_pattern = re.compile(r'([\d,]+\.\d{3})')
    
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if not text:
                    continue
                
                lines = text.splitlines()
                i = 0
                while i < len(lines):
                    line = lines[i].strip()
                    
                    # 1. Check for single-line format first (contains full date)
                    full_date_match = full_date_pattern.search(line)
                    if full_date_match and not line.startswith('Date :') and not 'From date' in line:
                        raw_date = full_date_match.group(1)
                        amounts = amount_pattern.findall(line)
                        if amounts:
                            raw_amount = amounts[0].replace(',', '')
                            # Get surrounding lines to build description context
                            prev_line = lines[i-1].strip() if i > 0 else ''
                            next_line = lines[i+1].strip() if i+1 < len(lines) else ''
                            full_desc = f"{prev_line} {next_line}".strip()
                            
                            is_credit = any(kw in full_desc.lower() for kw in ["dep", "deposit", "refund", "credit", "knet", "incoming"]) and "withdrawal" not in full_desc.lower()
                            transactions.append({
                                "raw_date": raw_date,
                                "raw_desc": full_desc or "POS Transaction",
                                "raw_amount": raw_amount,
                                "raw_credit": raw_amount if is_credit else None
                            })
                        i += 1
                        continue
                        
                    # 2. Check for split format fallback
                    date_match = start_date_pattern.search(line)
                    if date_match:
                        raw_date_part = date_match.group(1)
                        desc_part1 = line[len(raw_date_part):].strip()
                        
                        i += 1
                        if i >= len(lines): break
                        amount_line = lines[i].strip()
                        amounts = amount_pattern.findall(amount_line)
                        if not amounts:
                            continue
                            
                        # Keep description from amount line
                        amount_desc = amount_line
                        for amt in amounts:
                            amount_desc = amount_desc.replace(amt, "")
                        amount_desc = re.sub(r'[\d,]+\.\d{3}', '', amount_desc).strip()
                        
                        i += 1
                        if i >= len(lines): break
                        year_line = lines[i].strip()
                        year_match = re.search(r'^(\d{4})', year_line)
                        year = ""
                        desc_part2 = year_line
                        if year_match:
                            year = year_match.group(1)
                            desc_part2 = year_line[4:].strip()
                            
                        full_date = raw_date_part + year
                        full_desc = f"{desc_part1} {amount_desc} {desc_part2}".strip()
                        raw_amount = amounts[0].replace(',', '')
                        
                        is_credit = any(kw in full_desc.lower() for kw in ["dep", "deposit", "refund", "credit", "knet", "incoming"]) and "withdrawal" not in full_desc.lower()
                        transactions.append({
                            "raw_date": full_date,
                            "raw_desc": full_desc or "POS Transaction",
                            "raw_amount": raw_amount,
                            "raw_credit": raw_amount if is_credit else None
                        })
                        i += 1
                    else:
                        i += 1
    except Exception as e:
        logger.error(f"Error in extract_kib_aseel: {e}")
        
    return transactions
