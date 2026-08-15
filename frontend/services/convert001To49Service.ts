import { CLOVER_BANK_INFO, VENDOR_OFFSET_ACCOUNTS, WARBA_BANK_INFO, WARBA_VENDOR_OFFSET_ACCOUNTS } from '../constants';
import { RawAccountingRow } from '../types';
import { extractCellValue } from './excelService';

export const BANK_ACCOUNT_MAPPING: Record<string, string> = {
    "AL ASEEL INTERNATIONAL POLYCLINIC": "WTAA-61012",
    "IRIS POLYCLINIC": "WRIR-73018",
    "YARROW POLYCLINIC": "WRYR-67011",
    "FOURTH MEDICAL CENTER": "WRFM-55018",
    "JOYA POLYCLINIC": "WRJY-10018",
    "MEDICAL HARBOUR CENTER": "WRMH-86019",
    "MED MARINE POLYCLINIC": "WRMM-42013",
    "Med Marine Medical Polyclinic": "WRMM-42013",
    "MED GRAY POLYCLINIC": "WRMG-77018",
    "ARAM MEDICAL POLYCLINIC": "WRAM-95018",
    "TRI CARE CLINIC": "WRTR-54019",
};

export const CONVERT_OUTPUT_HEADERS = [
    "Journal Number", "Journal Name", "Line Num", "Posting Date", "Account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6",
    "Account No", "Description", "Debit Amount", "Credit Amount", "Currency Code",
    "Exchange Rate", "Offset account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6",
    "Offset account", "Invoice No", "Document No", "Document Date", "Due Date",
    "Asset trans type - Acq - 1 / Depre - 3", "Posting Profile", "Payment Mode", "Payment Reference",
    "Number of Voucher", "Activities", "Country", "Departments", "Project_ID", "Property_ID"
];

const KEY_ALIASES: Record<string, string[]> = {
    'Offset Account': ['offset account', 'offsetaccount', 'offset account no', 'offset account number', 'offset_account', 'offset'],
    'Account No': ['account no', 'accountno', 'account number', 'account_no', 'account', 'acc no', 'acc_no'],
    'Debit Amount': ['debit amount', 'debit', 'debit (kwd)', 'debit amount (kwd)', 'debit amt', 'debit_amount'],
    'Credit Amount': ['credit amount', 'credit', 'credit (kwd)', 'credit amount (kwd)', 'credit amt', 'credit_amount'],
    'Posting Date': ['posting date', 'posting_date', 'date', 'trans date', 'transaction date'],
    'Description': ['description', 'desc', 'narration', 'particulars', 'details'],
    'Invoice No': ['invoice no', 'invoice_no', 'document no', 'document_no', 'inv no', 'invoice'],
    'Currency Code': ['currency code', 'currency_code', 'currency', 'curr'],
    'Exchange Rate': ['exchange rate', 'exchange_rate', 'ex rate', 'rate'],
};

export function getVal(row: RawAccountingRow, key: string): any {
    if (!row) return undefined;
    
    // Direct match
    if (row[key] !== undefined) return extractCellValue(row[key]);
    
    const aliases = KEY_ALIASES[key] || [key.toLowerCase()];
    const rowKeys = Object.keys(row);
    
    for (const rKey of rowKeys) {
        const rKeyNorm = rKey.trim().toLowerCase().replace(/[\s_\-]+/g, '');
        if (aliases.some(alias => alias.replace(/[\s_\-]+/g, '') === rKeyNorm)) {
            return extractCellValue(row[rKey]);
        }
    }
    
    return undefined;
}

/**
 * Standardizes date formatting from Excel cell values (supporting Date objects, numeric serials, or strings)
 */
export function formatDate(val: any): string {
    if (!val) return '';
    const cleanVal = extractCellValue(val);
    if (!cleanVal) return '';
    if (cleanVal instanceof Date) {
        const day = String(cleanVal.getDate()).padStart(2, '0');
        const month = String(cleanVal.getMonth() + 1).padStart(2, '0');
        const year = cleanVal.getFullYear();
        return `${day}-${month}-${year}`;
    }
    if (typeof cleanVal === 'number') {
        try {
            // Convert Excel serial date to JS Date (1900 date system)
            const date = new Date(Math.round((cleanVal - 25569) * 86400 * 1000));
            const day = String(date.getUTCDate()).padStart(2, '0');
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const year = date.getUTCFullYear();
            return `${day}-${month}-${year}`;
        } catch (e) {
            return cleanVal.toString();
        }
    }
    return cleanVal.toString();
}

/**
 * Converts Clover journal entries from ledger 001 and maps them to customer account 49-000001
 */
export function convert001To49Rows(rows: RawAccountingRow[]): any[] {
    const convertedEntries: any[] = [];
    let journalNumberCounter = 0;
    let lastAccountNo = '';
    let lineNumCounter = 0;

    // Check if any row has an explicit offset account column
    const hasOffsetColumn = rows.some(row => 
        Object.keys(row).some(k => k.trim().toLowerCase().includes('offset'))
    );

    for (const row of rows) {
        const offsetAccountInfo = getVal(row, 'Offset Account');
        const offsetAccount = (offsetAccountInfo !== undefined && offsetAccountInfo !== null)
            ? offsetAccountInfo.toString().trim()
            : '';

        if (hasOffsetColumn) {
            // Filter by Clover 50 account (e.g. starting with 50- or 50)
            if (!offsetAccount || (!offsetAccount.startsWith('50-') && !offsetAccount.startsWith('50'))) {
                continue;
            }
        }

        const rawAccountNo = getVal(row, 'Account No');
        const accountNo = (rawAccountNo !== undefined && rawAccountNo !== null) ? rawAccountNo.toString().trim() : '';

        // Group by original Account No
        if (accountNo !== lastAccountNo) {
            journalNumberCounter++;
            lastAccountNo = accountNo;
            lineNumCounter = 1;
        } else {
            lineNumCounter++;
        }

        // Determine new Debit and Credit
        const oldDebitInfo = getVal(row, 'Debit Amount');
        const oldCreditInfo = getVal(row, 'Credit Amount');
        
        let newDebit: any = '';
        let newCredit: any = '';

        const oldDebitStr = (oldDebitInfo !== null && oldDebitInfo !== undefined) ? oldDebitInfo.toString().trim() : '';
        const oldCreditStr = (oldCreditInfo !== null && oldCreditInfo !== undefined) ? oldCreditInfo.toString().trim() : '';

        if (oldDebitStr === '' && oldCreditStr !== '') {
            newDebit = oldCreditInfo;
        } else if (oldDebitStr !== '' && oldCreditStr === '') {
            newCredit = oldDebitInfo;
        } else {
            // Swap default case when both columns have values or both are empty
            newDebit = (oldCreditInfo !== null && oldCreditInfo !== undefined && oldCreditInfo !== '') ? oldCreditInfo : '';
            newCredit = (oldDebitInfo !== null && oldDebitInfo !== undefined && oldDebitInfo !== '') ? oldDebitInfo : '';
        }

        let newAccountNo = accountNo;
        let newOffsetAccount = '50-000001';
        let activities = getVal(row, 'Activities') || '';
        let country = getVal(row, 'Country') || '';
        let departments = getVal(row, 'Departments') || '';
        let projectId = getVal(row, 'Project_ID') || getVal(row, 'Project ID') || '';
        let propertyId = getVal(row, 'Property_ID') || getVal(row, 'Property ID') || '';

        const bankInfo = WARBA_BANK_INFO.find(info => info.accountNo === accountNo || info.oldAccountNo === accountNo) || 
                        CLOVER_BANK_INFO.find(info => info.accountNo === accountNo || info.oldAccountNo === accountNo);
        
        if (bankInfo) {
            activities = bankInfo.activities;
            country = bankInfo.country;
            departments = bankInfo.departments;
            projectId = bankInfo.projectId;
            propertyId = bankInfo.propertyId;

            if (BANK_ACCOUNT_MAPPING[bankInfo.accountName]) {
                newAccountNo = BANK_ACCOUNT_MAPPING[bankInfo.accountName];
            } else {
                newAccountNo = bankInfo.accountNo || newAccountNo;
            }
            
            if (WARBA_VENDOR_OFFSET_ACCOUNTS[bankInfo.accountName]) {
                newOffsetAccount = WARBA_VENDOR_OFFSET_ACCOUNTS[bankInfo.accountName];
            } else if (VENDOR_OFFSET_ACCOUNTS[bankInfo.accountName]) {
                newOffsetAccount = VENDOR_OFFSET_ACCOUNTS[bankInfo.accountName];
            }
        }

        const newEntry = {
            "Journal Number": journalNumberCounter,
            "Journal Name": "GenJournal",
            "Line Num": lineNumCounter,
            "Posting Date": formatDate(getVal(row, 'Posting Date')),
            "Account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6": 1, // 1 for Customer
            "Account No": '49-000001',
            "Description": (() => {
                const desc = (getVal(row, 'Description') || '').toString();
                return desc.split('/')[0].trim();
            })(),
            "Debit Amount": newDebit,
            "Credit Amount": newCredit,
            "Currency Code": getVal(row, 'Currency Code') || 'KWD',
            "Exchange Rate": getVal(row, 'Exchange Rate') || 100,
            "Offset account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6": '', // Empty to match output
            "Offset account": 0, 
            "Invoice No": '2101432',
            "Document No": getVal(row, 'Invoice No') || getVal(row, 'Invoice no') || getVal(row, 'Document No') || '',
            "Document Date": '', // Empty to match output
            "Due Date": formatDate(getVal(row, 'Posting Date')) || formatDate(getVal(row, 'Due Date')),
            "Asset trans type - Acq - 1 / Depre - 3": getVal(row, 'Asset trans type') || '',
            "Posting Profile": 'Vend Post',
            "Payment Mode": getVal(row, 'Payment Mode') || '',
            "Payment Reference": getVal(row, 'Payment Reference') || '',
            "Number of Voucher": lineNumCounter,
            "Activities": activities,
            "Country": country,
            "Departments": departments,
            "Project_ID": projectId,
            "Property_ID": propertyId
        };

        convertedEntries.push(newEntry);
    }
    
    return convertedEntries;
}

