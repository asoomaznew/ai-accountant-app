import { ExtractedData, JournalEntry } from '../types';
import { WARBA_BANK_INFO, WARBA_VENDOR_OFFSET_ACCOUNTS } from '../warbaConstants';
import { OUTPUT_HEADER, INTERNAL_TRANSFER_ACCOUNT_TO_OFFSET } from '../constants';
function normalizeName(name: string): string {
    return name.toLowerCase()
        .replace(/\s+(polyclinic|polyclinics|polyclinc|center|clinic)\s*/g, ' ')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '-');
}

const normalizedVendorOffsetAccounts: { [key: string]: string } = Object.entries(WARBA_VENDOR_OFFSET_ACCOUNTS)
    .reduce((acc, [key, value]) => {
        acc[normalizeName(key)] = value;
        return acc;
    }, {} as { [key:string]: string });


function formatDateToDDMMYYYY(isoDate: string): string {
    // Handles dates like '2024-07-29'
    try {
        const date = new Date(isoDate);
        if (isNaN(date.getTime())) return isoDate; // Return original if invalid

        // Use UTC methods to avoid timezone-related date shifts
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // getUTCMonth is 0-indexed
        const year = date.getUTCFullYear();
        return `${day}-${month}-${year}`;
    } catch (e) {
        return isoDate; // Fallback
    }
}

function normalizeAcc(acc: string | undefined): string {
    if (!acc) return '';
    return acc.replace(/^0+/, '').trim();
}

function normalizeAmount(amount: number): number {
    const numericAmount = Number(amount);
    return Number.isFinite(numericAmount) ? Math.abs(numericAmount) : amount;
}

export function generateJournalEntries(data: ExtractedData, offsetAccounts?: { [key: string]: string }): JournalEntry[] {
    const { accountName, accountNumber, transactions } = data;

    if (!transactions || transactions.length === 0) {
        return [];
    }
    
    // --- Correction Logic ---
    const correctedTransactions = transactions.map(transaction => {
        const lowerCaseDescription = transaction.description.toLowerCase();
        const correctedTransaction = { ...transaction };
        const numericAmount = Number(transaction.amount);

        correctedTransaction.amount = normalizeAmount(transaction.amount);

        if (
            lowerCaseDescription.includes("deposit") || 
            lowerCaseDescription.includes("transfer from") || 
            lowerCaseDescription.includes("incoming") ||
            lowerCaseDescription.includes("profit") ||
            lowerCaseDescription.includes("interest")
        ) {
            correctedTransaction.type = 'credit';
        }

        if (Number.isFinite(numericAmount) && numericAmount < 0) {
            correctedTransaction.type = 'debit';
        }

        if (lowerCaseDescription.includes("pos purchase")) {
            correctedTransaction.type = 'debit';
        }

        if (lowerCaseDescription.includes("salary credit") || lowerCaseDescription.includes("salary charges")) {
            correctedTransaction.type = 'debit';
        }

        return correctedTransaction;
    });


    // --- Lookups ---
    const normAcc = normalizeAcc(accountNumber);
    const bankInfo = WARBA_BANK_INFO.find(info => {
        const check1 = normalizeAcc(info.accountNo) === normAcc;
        const check2 = info.oldAccountNo ? normalizeAcc(info.oldAccountNo) === normAcc : false;
        return check1 || check2;
    });
    
    const finalJournalAccountNo = bankInfo ? bankInfo.accountNo : accountNumber;
    
    const officialAccountName = bankInfo ? bankInfo.accountName : accountName;
    const normalizedAccountName = normalizeName(officialAccountName);
    
    const activeOffsetAccounts = offsetAccounts || WARBA_VENDOR_OFFSET_ACCOUNTS;
    const activeNormalizedOffsetAccounts: { [key: string]: string } = Object.entries(activeOffsetAccounts)
        .reduce((acc, [key, val]) => {
            acc[normalizeName(key)] = val;
            return acc;
        }, {} as { [key: string]: string });

    const offsetAccountKey = Object.keys(activeNormalizedOffsetAccounts)
        .sort((a,b) => b.length - a.length)
        .find(key => normalizedAccountName.includes(key) || key.includes(normalizedAccountName));
    const baseOffsetAccount = activeNormalizedOffsetAccounts[normalizedAccountName] || (offsetAccountKey ? activeNormalizedOffsetAccounts[offsetAccountKey] : 'N/A');

    if (!bankInfo) {
        console.warn(`Could not find matching bank info for account number: ${accountNumber}. Some fields may be 'N/A'.`);
    }
    if (baseOffsetAccount === 'N/A') {
         console.warn(`Could not find matching offset account for: ${officialAccountName}`);
    }

    // Filter out transactions that should be ignored based on description.
    const filteredTransactions = correctedTransactions.filter(transaction => {
        const desc = (transaction.description || "").trim();
        if (!desc || desc === "(no description)") {
            return false;
        }

        const lowerCaseDescription = desc.toLowerCase();
        if (lowerCaseDescription.includes("unknown transaction")) {
            return false;
        }

        return !lowerCaseDescription.includes("transfer deposit knet") 
            && !lowerCaseDescription.includes("merchant rcon pay")
            && !lowerCaseDescription.includes("merchant fee")
            && !lowerCaseDescription.includes("transfer withdrawal rental fee");
    });

    if (filteredTransactions.length === 0) {
        return [];
    }

    // 1. Map all transactions to a preliminary entry structure. Dates remain in YYYY-MM-DD for processing.
    const mappedEntries = filteredTransactions.map(transaction => {
        const postingDate = transaction.date;
        const isCredit = transaction.type === 'credit';
        const lowerDesc = transaction.description.toLowerCase();

        // Override Offset Account based on specific content in description
        let transactionOffsetAccount = baseOffsetAccount;
        let transactionOffsetAccountType = 2; // Default

        // Inter-account transfer detection: look for 12-digit account numbers in description
        const PRIME_ACCOUNTS_W = new Set(['011010232800', '11010232800']);
        const internalAccountsInDescW = Object.keys(INTERNAL_TRANSFER_ACCOUNT_TO_OFFSET)
            .filter(acc => acc.length >= 12 && lowerDesc.includes(acc.toLowerCase()));

        if (internalAccountsInDescW.length >= 2) {
            const hasPrime = internalAccountsInDescW.some(acc => PRIME_ACCOUNTS_W.has(acc));
            transactionOffsetAccount = hasPrime ? '50-000001' : 'M11599';
            transactionOffsetAccountType = 0;
        }

        if (lowerDesc.includes("saving account profit")) {
            transactionOffsetAccount = 'M52708';
            transactionOffsetAccountType = 0;
        }
        
        return {
            journalNumber: isCredit ? 2 : 1,
            journalName: isCredit ? 'CRNOTE' : 'STVINV',
            postingDate: postingDate,
            accountType: 6,
            accountNo: finalJournalAccountNo,
            description: transaction.description,
            debitAmount: isCredit ? transaction.amount : '',
            creditAmount: isCredit ? '' : transaction.amount,
            currencyCode: 'KWD',
            exchangeRate: 100,
            offsetAccountType: transactionOffsetAccountType,
            offsetAccount: transactionOffsetAccount || 'N/A',
            documentNo: '',
            documentDate: postingDate,
            dueDate: postingDate,
            assetTransType: '',
            postingProfile: 'Vend Post',
            paymentMode: '',
            paymentReference: '',
            activities: bankInfo?.activities || 'N/A',
            country: bankInfo?.country || 'N/A',
            departments: bankInfo?.departments || 'N/A',
            projectId: bankInfo?.projectId || 'N/A',
            propertyId: bankInfo?.propertyId || 'N/A',
            // Placeholders to be replaced after sorting
            lineNum: 0,
            numberOfVoucher: 0,
            invoiceNo: '',
        };
    });
    
    // 2. Club bank charges and small debits
     const isAggregatableDebit = (e: any) => {
        const isDebit = e.journalName === 'STVINV' || e.journalName === 'CRNOTE'; // Either can be a credit now
        if (!isDebit || e.creditAmount === '') return false;

        const creditAmount = typeof e.creditAmount === 'number' ? Math.abs(e.creditAmount) : 0;
        const isSmallAmount = creditAmount > 0 && creditAmount <= 9;
        const isTfrCharge = e.description.toLowerCase().includes('tfr charge');
        
        return isSmallAmount || isTfrCharge;
    };
    
    const debitsToAggregate = mappedEntries.filter(isAggregatableDebit);
    const otherEntries = mappedEntries.filter(e => !isAggregatableDebit(e));

    if (debitsToAggregate.length > 0) {
        const totalAggregatedAmount = debitsToAggregate.reduce((sum, e) => sum + Math.abs(e.creditAmount as number), 0);
        const latestDate = new Date(Math.max(...debitsToAggregate.map(t => new Date(t.postingDate).getTime())));
        const latestDateString = latestDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD for processing

        const aggregatedDebitEntry = {
            ...debitsToAggregate[0], // Use first as a template
            postingDate: latestDateString,
            documentDate: latestDateString,
            dueDate: latestDateString,
            description: 'Aggregated Bank Charges and Fees',
            debitAmount: '',
            creditAmount: totalAggregatedAmount,
        };
        otherEntries.push(aggregatedDebitEntry);
    }


    // 3. Sort the entries: first by journal name, then by posting date.
    otherEntries.sort((a, b) => {
        if (a.journalName !== b.journalName) {
             // Custom sort order if needed, e.g., STVINV before CRNOTE
             if (a.journalName === 'STVINV') return -1;
             if (b.journalName === 'STVINV') return 1;
            return a.journalName.localeCompare(b.journalName);
        }
        return new Date(a.postingDate).getTime() - new Date(b.postingDate).getTime();
    });

    // 4. Finalize the entries by iterating over the sorted list to assign sequential numbers and format dates.
    // Shorten account name for Invoice No to fit within 20 chars
    const shortAccountName = officialAccountName.split(' ')[0].toUpperCase().substring(0, 4);
    let lineNumCounter = 0;
    let currentJournalNumber = 1;
    let lastJournalName = otherEntries[0]?.journalName || '';
    const seenInvoices = new Set<string>();

    return otherEntries.map((entry, index) => {
        if (entry.journalName !== lastJournalName) {
            currentJournalNumber++;
            lastJournalName = entry.journalName;
            lineNumCounter = 1;
        } else {
            if (index === 0) {
                lineNumCounter = 1;
            } else {
                lineNumCounter++;
            }
        }
        
        entry.journalNumber = currentJournalNumber;
        
        const invoiceCounter = index + 1;
        const date = new Date(entry.postingDate);
        const monthName = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        const originalDescLower = entry.description.toLowerCase();

        // Updated Description logic
        let finalDescription = '';
        if (originalDescLower.includes("011010232800") || originalDescLower.includes("al mazaya prime")) {
            finalDescription = `${entry.accountNo}/Transfer from/to Al Mazaya Prime`;
        } else if (originalDescLower.includes("saving account profit")) {
            finalDescription = `${entry.accountNo}/Saving account profit Deposit`;
        } else if (entry.description === 'Aggregated Bank Charges and Fees') {
            finalDescription = entry.description;
        } else {
            const typeSuffix = entry.journalName === 'CRNOTE' ? 'TT' : 'PMT';
            finalDescription = `${entry.accountNo}/INVESTOR-SLARY/${monthName}-26/${typeSuffix}`;
        }

        // Ensure "Invoice No" does not exceed 20 characters and is unique
        let generatedInvoiceNo = `${shortAccountName}-Sal-${monthName}-${invoiceCounter}`;
        if (generatedInvoiceNo.length > 20) {
             generatedInvoiceNo = `${shortAccountName.substring(0, 3)}-S-${monthName.substring(0, 3)}-${invoiceCounter}`;
        }
        
        let finalInvoiceNo = generatedInvoiceNo.substring(0, 20);
        let suffix = 1;
        while (seenInvoices.has(finalInvoiceNo)) {
            const base = generatedInvoiceNo.length > 17 ? generatedInvoiceNo.substring(0, 17) : generatedInvoiceNo;
            finalInvoiceNo = `${base}-${suffix}`.substring(0, 20);
            suffix++;
        }
        seenInvoices.add(finalInvoiceNo);

        const finalEntry: JournalEntry = {
            ...entry,
            lineNum: lineNumCounter,
            numberOfVoucher: lineNumCounter,
            invoiceNo: finalInvoiceNo,
            description: finalDescription,
            postingDate: formatDateToDDMMYYYY(entry.postingDate),
            documentDate: formatDateToDDMMYYYY(entry.documentDate),
            dueDate: formatDateToDDMMYYYY(entry.dueDate),
        };
        return finalEntry;
    });
}

export async function convertToXLSX(data: JournalEntry[]): Promise<ArrayBuffer> {
    const header = OUTPUT_HEADER;
    const rows = data.map(entry => [
        entry.journalNumber,
        entry.journalName,
        entry.lineNum,
        entry.postingDate,
        entry.accountType,
        entry.accountNo,
        entry.description,
        entry.debitAmount,
        entry.creditAmount,
        entry.currencyCode,
        entry.exchangeRate,
        entry.offsetAccountType,
        entry.offsetAccount,
        entry.invoiceNo,
        entry.documentNo,
        entry.documentDate,
        entry.dueDate,
        entry.assetTransType,
        entry.postingProfile,
        entry.paymentMode,
        entry.paymentReference,
        entry.numberOfVoucher,
        entry.activities,
        entry.country,
        entry.departments,
        entry.projectId,
        entry.propertyId,
        entry.unitId || ""
    ]);

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("JournalEntries");
    worksheet.addRow(header);
    rows.forEach(row => worksheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as ArrayBuffer;
}
