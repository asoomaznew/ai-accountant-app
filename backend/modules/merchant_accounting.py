import logging
from typing import Dict, Any, List
import pandas as pd
from .merchant_constants import CLOVER_BANK_INFO, VENDOR_OFFSET_ACCOUNTS, ACCOUNT_NO_TO_OFFSET_MAPPING, INTERNAL_TRANSFER_ACCOUNT_TO_OFFSET
from .accounting_module import _detect_inter_account_transfer

logger = logging.getLogger(__name__)

def _normalize_acc(acc: str) -> str:
    if not acc:
        return ""
    return str(acc).lstrip('0').strip()

def _format_date_dd_mm_yyyy(iso_date: str) -> str:
    try:
        ts = pd.to_datetime(iso_date, errors="coerce")
        if pd.isna(ts):
            return iso_date
        return ts.strftime("%d-%m-%Y")
    except Exception:
        return iso_date

def generate_merchant_journal_entries(
    extracted_data: Dict[str, Any],
    forced_offset_account: str = None,
    is_pos: bool = False,
    offset_accounts: Dict[str, str] = None
) -> List[Dict[str, Any]]:
    account_name = extracted_data.get("accountName", "")
    account_number = extracted_data.get("accountNumber", "")
    transactions = extracted_data.get("transactions", [])

    if not transactions:
        return []

    # --- Correction Logic ---
    corrected_transactions = []
    for t in transactions:
        t_dict = dict(t)
        desc_lower = str(t_dict.get("description", "")).lower()
        if "pos purchase" in desc_lower:
            t_dict["type"] = "debit"
        if "salary credit" in desc_lower or "salary charges" in desc_lower:
            t_dict["type"] = "debit"
        corrected_transactions.append(t_dict)

    # --- Lookups ---
    norm_acc = _normalize_acc(account_number)
    bank_info = None
    for info in CLOVER_BANK_INFO:
        check1 = _normalize_acc(info.get("accountNo", "")) == norm_acc
        check2 = _normalize_acc(info.get("oldAccountNo", "")) == norm_acc if info.get("oldAccountNo") else False
        if check1 or check2:
            bank_info = info
            break
            
    final_journal_account_no = bank_info.get("accountNo") if bank_info else account_number
    
    active_offset_accounts = offset_accounts if offset_accounts else VENDOR_OFFSET_ACCOUNTS
    default_offset_account = (
        forced_offset_account or 
        (active_offset_accounts.get(bank_info.get("accountName")) if bank_info else None) or 
        ACCOUNT_NO_TO_OFFSET_MAPPING.get(final_journal_account_no) or 
        "50-000001"
    )

    if not bank_info:
        logger.warning(f"Could not find matching bank info for account number: {account_number}. Some fields may be 'N/A'.")

    # Filter out transactions
    filtered_transactions = []
    for t in corrected_transactions:
        desc_lower = str(t.get("description", "")).lower()
        amount_val = 0.0
        try:
            amount_val = float(str(t.get("amount", "0")).replace(',', ''))
        except:
            pass
        if t.get("type") == "debit" and "fees" in desc_lower and amount_val <= 9:
            continue
        # Skip "merchant rcon pay" lines — these are internal reconciliation/payment
        # entries the user does NOT want journaled (per request). KNET deposits and
        # other credits are kept.
        if "merchant rcon pay" in desc_lower:
            continue
        filtered_transactions.append(t)

    if not filtered_transactions:
        return []

    # 1. Map all transactions
    mapped_entries = []
    for t in filtered_transactions:
        posting_date = t.get("date", "")
        is_credit = str(t.get("type", "")).lower() == "credit"
        desc_lower = str(t.get("description", "")).lower()
        
        # Per-transaction bank account resolution
        t_acc = t.get("accountNumber") or account_number
        norm_acc = _normalize_acc(t_acc)
        t_bank_info = None
        for info in CLOVER_BANK_INFO:
            check1 = _normalize_acc(info.get("accountNo", "")) == norm_acc
            check2 = _normalize_acc(info.get("oldAccountNo", "")) == norm_acc if info.get("oldAccountNo") else False
            if check1 or check2:
                t_bank_info = info
                break

        if t_bank_info:
            txn_account_no = t_bank_info.get("accountNo")
        elif len(norm_acc) >= 4:
            lower_name = account_name.lower()
            prefix = "KIB"
            if "aram" in lower_name: prefix = "KIBAM"
            elif "gray" in lower_name: prefix = "KIBMG"
            elif "marine" in lower_name: prefix = "KIBMM"
            elif "harbour" in lower_name: prefix = "KIBMH"
            elif "joya" in lower_name: prefix = "KIBJY"
            elif "fourth" in lower_name: prefix = "KIBFR"
            elif "tri care" in lower_name: prefix = "KIBTR"
            elif "aseel" in lower_name: prefix = "KIBAA"
            elif "iris" in lower_name: prefix = "KIBIR"
            elif "yarrow" in lower_name: prefix = "KIBYR"
            elif "mewl" in lower_name or "med well" in lower_name: prefix = "KIBML"
            txn_account_no = f"{prefix}-{norm_acc[-4:]}"
        else:
            txn_account_no = t_acc or final_journal_account_no

        active_b_info = t_bank_info or bank_info
        
        transaction_offset_account = default_offset_account
        transaction_offset_account_type = 2 # Default Ledger

        # Detect inter-account transfer (requires 2 internal account numbers in description)
        inter_offset, inter_type = _detect_inter_account_transfer(str(t.get("description", "")))
        if inter_offset:
            transaction_offset_account = inter_offset
            transaction_offset_account_type = inter_type
        elif "saving account profit" in desc_lower:
            transaction_offset_account = "M52708"
            transaction_offset_account_type = 0
            
        # If the account is Prime (50-000001), type should always be 2.
        if transaction_offset_account == "50-000001":
            transaction_offset_account_type = 2
            
        final_journal_name = "CRNOTE" if is_pos else ("CRNOTE" if is_credit else "STVINV")
        final_journal_number = 2 if is_pos else (2 if is_credit else 1)
        
        amount = t.get("amount")
        if amount is None:
            amount = 0.0
        try:
            amount = float(amount)
        except (ValueError, TypeError):
            amount = 0.0
            
        final_debit_amount = amount if is_pos else (amount if is_credit else "")
        final_credit_amount = "" if is_pos else ("" if is_credit else amount)

        mapped_entries.append({
            "journalNumber": final_journal_number,
            "journalName": final_journal_name,
            "postingDate": posting_date,
            "accountType": 6,
            "accountNo": txn_account_no,
            "description": t.get("description", ""),
            "debitAmount": final_debit_amount,
            "creditAmount": final_credit_amount,
            "currencyCode": "KWD",
            "exchangeRate": 100,
            "offsetAccountType": transaction_offset_account_type,
            "offsetAccount": transaction_offset_account,
            "documentNo": "",
            "documentDate": posting_date,
            "dueDate": posting_date,
            "assetTransType": "",
            "postingProfile": "Vend Post",
            "paymentMode": "",
            "paymentReference": "",
            "activities": active_b_info.get("activities", "N/A") if active_b_info else "N/A",
            "country": active_b_info.get("country", "N/A") if active_b_info else "N/A",
            "departments": active_b_info.get("departments", "N/A") if active_b_info else "N/A",
            "projectId": active_b_info.get("projectId", "N/A") if active_b_info else "N/A",
            "propertyId": active_b_info.get("propertyId", "N/A") if active_b_info else "N/A",
            "lineNum": 0,
            "numberOfVoucher": 0,
            "invoiceNo": "",
        })

    # 2. Club bank charges and small debits
    def is_aggregatable_debit(e):
        is_debit = e.get("journalName") in ("STVINV", "CRNOTE")
        if not is_debit or e.get("creditAmount") == "":
            return False
        c_amt = e.get("creditAmount")
        is_small_amount = isinstance(c_amt, (int, float)) and c_amt <= 9
        is_tfr_charge = "tfr charge" in str(e.get("description", "")).lower()
        return is_small_amount or is_tfr_charge

    debits_to_aggregate = [e for e in mapped_entries if is_aggregatable_debit(e)]
    other_entries = [e for e in mapped_entries if not is_aggregatable_debit(e)]

    if debits_to_aggregate:
        total_aggregated_amount = sum([float(e.get("creditAmount") or 0.0) for e in debits_to_aggregate])
        latest_date_str = max([e.get("postingDate", "") for e in debits_to_aggregate])
        
        aggregated_debit_entry = dict(debits_to_aggregate[0])
        aggregated_debit_entry.update({
            "postingDate": latest_date_str,
            "documentDate": latest_date_str,
            "dueDate": latest_date_str,
            "description": "Aggregated Bank Charges and Fees",
            "debitAmount": "",
            "creditAmount": total_aggregated_amount,
        })
        other_entries.append(aggregated_debit_entry)

    # 3. Sort entries (CRNOTE > STVINV, then by posting date)
    def sort_key(e):
        jname = e.get("journalName", "")
        pdate = e.get("postingDate", "")
        # STVINV before CRNOTE in JS: 
        # `if (a.journalName === 'STVINV') return -1;`
        jname_weight = 0 if jname == "STVINV" else 1
        return (jname_weight, pdate)

    other_entries.sort(key=sort_key)

    # 4. Finalize entries
    final_official_account_name = bank_info.get("accountName") if bank_info else account_name
    short_account_name = str(final_official_account_name).split(' ')[0].upper()[:4]
    
    line_num_counter = 0
    last_journal_num = -1
    seen_invoices = set()
    
    final_entries = []
    
    for index, entry in enumerate(other_entries):
        if entry.get("journalNumber") != last_journal_num:
            last_journal_num = entry.get("journalNumber")
            line_num_counter = 1
        else:
            line_num_counter += 1
            
        invoice_counter = index + 1
        
        try:
            date_obj = pd.to_datetime(entry.get("postingDate", ""))
            month_name = date_obj.strftime("%b").upper() if not pd.isna(date_obj) else "UNK"
        except Exception:
            month_name = "UNK"
            
        original_desc_lower = str(entry.get("description", "")).lower()
        acc_no = entry.get("accountNo", "")
        
        # Description logic
        final_description = ""
        if is_pos:
            final_description = f"{acc_no} - POS Insurance & Utilities to mazaya Prime"
        elif "011010232800" in original_desc_lower or "al mazaya prime" in original_desc_lower:
            final_description = f"{acc_no}/Transfer from/to Al Mazaya Prime"
        elif "saving account profit" in original_desc_lower:
            final_description = f"{acc_no}/Saving account profit Deposit"
        elif entry.get("description") == "Aggregated Bank Charges and Fees":
            final_description = entry.get("description")
        else:
            type_suffix = "TT" if entry.get("journalName") == "CRNOTE" else "PMT"
            final_description = f"{acc_no}/INVESTOR-SLARY/{month_name}-26/{type_suffix}"
            
        formatted_date = _format_date_dd_mm_yyyy(entry.get("postingDate", ""))
        generated_invoice_no = f"{short_account_name}-Sal-{formatted_date}-{invoice_counter}"
        
        if len(generated_invoice_no) > 20:
            generated_invoice_no = f"{short_account_name[:2]}-S-{formatted_date}-{invoice_counter}"
            
        final_invoice_no = generated_invoice_no[:20]
        suffix = 1
        while final_invoice_no in seen_invoices:
            base = generated_invoice_no[:17] if len(generated_invoice_no) > 17 else generated_invoice_no
            final_invoice_no = f"{base}-{suffix}"[:20]
            suffix += 1
        
        seen_invoices.add(final_invoice_no)
        
        final_entry = dict(entry)
        final_entry.update({
            "description": final_description,
            "lineNum": line_num_counter,
            "numberOfVoucher": line_num_counter,
            "invoiceNo": final_invoice_no,
            "postingDate": formatted_date,
            "documentDate": _format_date_dd_mm_yyyy(entry.get("documentDate", "")),
            "dueDate": _format_date_dd_mm_yyyy(entry.get("dueDate", "")),
            "is_merchant_fully_formatted": True # Flag for the export agent
        })
        final_entries.append(final_entry)

    return final_entries
