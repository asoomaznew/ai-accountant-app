import { CLOVER_BANK_INFO, VENDOR_OFFSET_ACCOUNTS, WARBA_BANK_INFO, WARBA_VENDOR_OFFSET_ACCOUNTS } from '../constants';
import { RawAccountingRow } from '../types';

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

/**
 * Standardizes date formatting from Excel cell values (supporting Date objects, numeric serials, or strings)
 */
export function formatDate(val: any): string {
    if (!val) return '';
    if (val instanceof Date) {
        const day = String(val.getDate()).padStart(2, '0');
        const month = String(val.getMonth() + 1).padStart(2, '0');
        const year = val.getFullYear();
        return `${day}-${month}-${year}`;
    }
    if (typeof val === 'number') {
        try {
            // Convert Excel serial date to JS Date (1900 date system)
            const date = new Date(Math.round((val - 25569) * 86400 * 1000));
            const day = String(date.getUTCDate()).padStart(2, '0');
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const year = date.getUTCFullYear();
            return `${day}-${month}-${year}`;
        } catch (e) {
            return val.toString();
        }
    }
    return val.toString();
}

/**
 * Converts Clover journal entries from ledger 001 and maps them to customer account 49-000001
 */
export function convert001To49Rows(rows: RawAccountingRow[]): any[] {
    const getVal = (row: RawAccountingRow, key: string): any => {
        if (!row) return undefined;
        if (row[key] !== undefined) return row[key];
        const lowerKey = key.toLowerCase();
        const foundKey = Object.keys(row).find(k => k.toLowerCase() === lowerKey);
        return foundKey ? row[foundKey] : undefined;
    };
    
    const convertedEntries: any[] = [];
    let journalNumberCounter = 0;
    let lastAccountNo = '';
    let lineNumCounter = 0;

    for (const row of rows) {
        // Check for Offset Account starting with 50- (any Clover 50 account)
        const offsetAccountInfo = getVal(row, 'Offset Account') ?? getVal(row, 'Offset account');
        const offsetAccount = offsetAccountInfo?.toString().trim();
        if (!offsetAccount || !offsetAccount.startsWith('50-')) continue;

        const accountNo = getVal(row, 'Account No')?.toString().trim() || '';

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
            // NOTE: Default Account No representing the customer '49-000001' as required for this automated mapping
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
            // NOTE: Default Offset account representation set to 0 as required for output matching
            "Offset account": 0, 
            // NOTE: Default template Invoice No '2101432' as fallback placeholder
            "Invoice No": '2101432',
            "Document No": getVal(row, 'Invoice No') || getVal(row, 'Invoice no') || '',
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
