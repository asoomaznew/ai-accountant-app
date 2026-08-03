import { ExtractedData, JournalEntry } from '../types';
import { CLOVER_BANK_INFO, WARBA_BANK_INFO, VENDOR_OFFSET_ACCOUNTS, WARBA_VENDOR_OFFSET_ACCOUNTS, ACCOUNT_NO_TO_OFFSET_MAPPING, OUTPUT_HEADER, INTERNAL_TRANSFER_ACCOUNT_TO_OFFSET } from '../constants';

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

/**
 * Try to infer the bank account number from transaction descriptions, 
 * overall account name, or filename (for cases where Gemini returned "N/A" or Terminal ID).
 *
 * Looks for clinic name keywords (e.g. "Aram", "Joya", "Iris", "Med Marine") and
 * matches against CLOVER_BANK_INFO.accountName. Returns the FIRST matching
 * accountNo, or null if no match.
 */
function inferAccountFromDescription(descText: string, accountName?: string, fileName?: string): string | null {
    const haystack = `${accountName || ""} ${descText || ""} ${fileName || ""}`.toLowerCase();
    if (!haystack.trim()) return null;

    // Define an ordered list of clinic name keywords (longest first to avoid
    // false matches like "Med" before "Med Marine").
    const CLINIC_KEYWORDS: Array<{ keywords: string[]; preferredAccountNo: string }> = [
        { keywords: ["med marine"], preferredAccountNo: "KIBMM-2207" },
        { keywords: ["med gray", "med gray"], preferredAccountNo: "KIBMG-2320" },
        { keywords: ["medical harbour", "medical harbour"], preferredAccountNo: "KIBMH-2231" },
        { keywords: ["al aseel", "aseel"], preferredAccountNo: "KIBAA-2380" },
        { keywords: ["aram"], preferredAccountNo: "KIBAM-2290" },  // primary (per constants.ts)
        { keywords: ["fourth medical", "fourth"], preferredAccountNo: "KIBFR-8602" },
        { keywords: ["joya"], preferredAccountNo: "KIBJY-2258" },
        { keywords: ["iris"], preferredAccountNo: "KIBIR-2282" },
        { keywords: ["yarrow"], preferredAccountNo: "KIBYR-4765" },
        { keywords: ["tri care", "tricare"], preferredAccountNo: "KIBTR-5252" },
        { keywords: ["medwell", "med well", "mewl"], preferredAccountNo: "KIBML-6601" },
    ];

    for (const { keywords, preferredAccountNo } of CLINIC_KEYWORDS) {
        for (const kw of keywords) {
            if (haystack.includes(kw)) {
                return preferredAccountNo;
            }
        }
    }
    return null;
}

export function generateJournalEntries(
    data: ExtractedData,
    forcedOffsetAccount?: string,
    isPOS?: boolean,
    offsetAccounts?: { [key: string]: string },
    fileName?: string,          // ← NEW: used to infer account when AI returns empty
): JournalEntry[] {
    let { accountName, accountNumber, transactions } = data;

    // ── Fallback: infer accountNumber from filename when AI returned empty/N/A ──
    // Pattern: "Aseel-2380-01-Jun-30-Jun.pdf" → last4 = "2380"
    // We then find the matching full account key in ACCOUNT_NO_TO_OFFSET_MAPPING.
    if ((!accountNumber || !accountNumber.trim() || accountNumber.toUpperCase() === "N/A") && fileName) {
        const last4Match = fileName.match(/[- ](\d{4})[-. ]/);
        if (last4Match) {
            const last4 = last4Match[1];
            const inferredKey = Object.keys(ACCOUNT_NO_TO_OFFSET_MAPPING)
                .find(key => key.endsWith(`-${last4}`));
            if (inferredKey) {
                accountNumber = inferredKey;
                console.info(`[journalService] Inferred accountNumber "${accountNumber}" from filename "${fileName}"`);
            }
        }
    }

    // ── Fallback 2: infer accountNumber from MERCHANT NAME in transactions ──
    // For POS flows, the merchant name (e.g. "Aram Medical Polyclinic") is the most reliable
    // signal since bank statements often have accountNumber="N/A".
    if ((!accountNumber || !accountNumber.trim() || accountNumber.toUpperCase() === "N/A") && transactions && transactions.length > 0) {
        // Try to extract a clinic name from the first few transactions' descriptions
        const descText = transactions.slice(0, 3).map(t => t.description || "").join(" ");
        const inferred = inferAccountFromDescription(descText, accountName);
        if (inferred) {
            accountNumber = inferred;
            console.info(`[journalService] Inferred accountNumber "${accountNumber}" from transaction descriptions`);
        }
    }

    if (!transactions || transactions.length === 0) {
        return [];
    }

    // --- Correction Logic ---
    const correctedTransactions = transactions.map(transaction => {
        const lowerCaseDescription = transaction.description.toLowerCase();
        const correctedTransaction = { ...transaction };

        // Strong indicators of DEBIT (Money leaving the bank)
        if (
            lowerCaseDescription.includes("withdrawal") ||
            lowerCaseDescription.includes("force posted debit") ||
            lowerCaseDescription.includes("pos purchase") ||
            lowerCaseDescription.includes("salary credit") ||
            lowerCaseDescription.includes("salary charges")
        ) {
            correctedTransaction.type = 'debit';
        }
        // Strong indicators of CREDIT (Money entering the bank)
        else if (
            lowerCaseDescription.includes("deposit") ||
            lowerCaseDescription.includes("incoming") ||
            lowerCaseDescription.includes("profit")
        ) {
            correctedTransaction.type = 'credit';
        }

        return correctedTransaction;
    });

    // --- Lookups ---
    const normAcc = normalizeAcc(accountNumber);

    // Helper to find bank info across all banks
    const findBankInfo = (acc: string) => {
        const nAcc = normalizeAcc(acc);
        let info = CLOVER_BANK_INFO.find(info =>
            normalizeAcc(info.accountNo) === nAcc || (info.oldAccountNo && normalizeAcc(info.oldAccountNo) === nAcc)
        );
        if (info) return { info, isWarba: false };

        info = WARBA_BANK_INFO.find(info =>
            normalizeAcc(info.accountNo) === nAcc || (info.oldAccountNo && normalizeAcc(info.oldAccountNo) === nAcc)
        );
        if (info) return { info, isWarba: true };

        return null;
    };

    let bankInfoResult = findBankInfo(accountNumber);

    // If not found (e.g. accountNumber is a Terminal ID or "N/A"), infer from name and descriptions
    if (!bankInfoResult) {
        const descText = transactions.slice(0, 5).map(t => t.description || "").join(" ");
        const inferredAcc = inferAccountFromDescription(descText, accountName, fileName);
        if (inferredAcc) {
            accountNumber = inferredAcc;
            bankInfoResult = findBankInfo(accountNumber);
            if (bankInfoResult) {
                console.info(`[journalService] Successfully mapped to bankInfo using inferred account "${accountNumber}"`);
            }
        }
    }

    // If still not found, try inferring from filename just in case
    if (!bankInfoResult && fileName) {
        const last4Match = fileName.match(/[- ](\d{4})[-. ]/);
        if (last4Match) {
            const last4 = last4Match[1];
            const inferredKey = Object.keys(ACCOUNT_NO_TO_OFFSET_MAPPING).find(key => key.endsWith(`-${last4}`));
            if (inferredKey) {
                accountNumber = inferredKey;
                bankInfoResult = findBankInfo(accountNumber);
                if (bankInfoResult) {
                    console.info(`[journalService] Successfully mapped using filename last 4 digits "${last4}"`);
                }
            }
        }
    }

    const bankInfo = bankInfoResult?.info;
    const isWarba = bankInfoResult?.isWarba || false;

    const finalJournalAccountNo = bankInfo ? bankInfo.accountNo : accountNumber;

    // Default mapping for offset account
    const activeOffsetAccounts = offsetAccounts || (isWarba ? WARBA_VENDOR_OFFSET_ACCOUNTS : VENDOR_OFFSET_ACCOUNTS);
    const defaultOffsetAccount = forcedOffsetAccount || (bankInfo && activeOffsetAccounts[bankInfo.accountName]) || ACCOUNT_NO_TO_OFFSET_MAPPING[finalJournalAccountNo] || '50-000001';

    if (!bankInfo) {
        console.warn(`Could not find matching bank info for account number or name: ${accountNumber} / ${accountName}. Some fields may be 'N/A'.`);
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

        if (lowerCaseDescription.includes("fees")) {
            return false;
        }

        return !lowerCaseDescription.includes("transfer deposit knet")
            && !lowerCaseDescription.includes("merchant rcon pay")
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

        // Resolve per-transaction bank account if transaction has its own accountNumber
        let txnAccountNo = finalJournalAccountNo;
        let txnBankInfo = bankInfo;
        const rawTxnAcc = (transaction as any).accountNumber;
        if (rawTxnAcc) {
            const normAcc = String(rawTxnAcc).replace(/^0+/, '').trim();
            const foundInfo = CLOVER_BANK_INFO.find(info => 
                (info.accountNo && info.accountNo.replace(/^0+/, '').trim() === normAcc) ||
                (info.oldAccountNo && info.oldAccountNo.replace(/^0+/, '').trim() === normAcc)
            );
            if (foundInfo) {
                txnAccountNo = foundInfo.accountNo;
                txnBankInfo = foundInfo;
            } else if (normAcc.length >= 4) {
                let prefix = "KIB";
                const lowerName = accountName.toLowerCase();
                if (lowerName.includes("aram")) prefix = "KIBAM";
                else if (lowerName.includes("gray")) prefix = "KIBMG";
                else if (lowerName.includes("marine")) prefix = "KIBMM";
                else if (lowerName.includes("harbour")) prefix = "KIBMH";
                else if (lowerName.includes("joya")) prefix = "KIBJY";
                else if (lowerName.includes("fourth")) prefix = "KIBFR";
                else if (lowerName.includes("tri care")) prefix = "KIBTR";
                else if (lowerName.includes("aseel")) prefix = "KIBAA";
                else if (lowerName.includes("iris")) prefix = "KIBIR";
                else if (lowerName.includes("yarrow")) prefix = "KIBYR";
                else if (lowerName.includes("mewl") || lowerName.includes("med well")) prefix = "KIBML";
                txnAccountNo = `${prefix}-${normAcc.slice(-4)}`;
            }
        }

        // Override Offset Account based on specific content in description
        let transactionOffsetAccount = defaultOffsetAccount;
        let transactionOffsetAccountType = 2; // Default

        // Inter-account transfer detection: look for 12-digit account numbers in description
        const PRIME_ACCOUNTS = new Set(['011010232800', '11010232800']);
        const internalAccountsInDesc = Object.keys(INTERNAL_TRANSFER_ACCOUNT_TO_OFFSET)
            .filter(acc => acc.length >= 12 && lowerDesc.includes(acc.toLowerCase()));

        if (internalAccountsInDesc.length >= 2) {
            const hasPrime = internalAccountsInDesc.some(acc => PRIME_ACCOUNTS.has(acc));
            transactionOffsetAccount = hasPrime ? '50-000001' : 'M11599';
            transactionOffsetAccountType = 0;
        }

        if (lowerDesc.includes("saving account profit")) {
            transactionOffsetAccount = 'M52708';
            transactionOffsetAccountType = 0;
        }

        const finalJournalName = isPOS ? 'CRNOTE' : (isCredit ? 'CRNOTE' : 'STVINV');
        const finalJournalNumber = isPOS ? 2 : (isCredit ? 2 : 1);
        const finalDebitAmount = isPOS ? transaction.amount : (isCredit ? transaction.amount : '');
        const finalCreditAmount = isPOS ? '' : (isCredit ? '' : Math.abs(transaction.amount));

        return {
            journalNumber: finalJournalNumber,
            journalName: finalJournalName,
            postingDate: postingDate,
            accountType: 6,
            accountNo: txnAccountNo,
            description: transaction.description,
            debitAmount: finalDebitAmount,
            creditAmount: finalCreditAmount,
            currencyCode: 'KWD',
            exchangeRate: 100,
            offsetAccountType: transactionOffsetAccountType,
            offsetAccount: transactionOffsetAccount,
            documentNo: '',
            documentDate: postingDate,
            dueDate: postingDate,
            assetTransType: '',
            postingProfile: 'Vend Post',
            paymentMode: '',
            paymentReference: '',
            activities: txnBankInfo?.activities || 'N/A',
            country: txnBankInfo?.country || 'N/A',
            departments: txnBankInfo?.departments || 'N/A',
            projectId: txnBankInfo?.projectId || 'N/A',
            propertyId: txnBankInfo?.propertyId || 'N/A',
            // Placeholders to be replaced after sorting
            lineNum: 0,
            numberOfVoucher: 0,
            invoiceNo: '',
        };
    });

    // 2. Club bank charges and small debits
    const isAggregatableDebit = (e: any) => {
        const isDebit = e.journalName === 'STVINV' || e.journalName === 'CRNOTE'; // Both journal names can be on the credit side now
        if (!isDebit || e.creditAmount === '') return false;

        const isSmallAmount = typeof e.creditAmount === 'number' && e.creditAmount > 0 && e.creditAmount <= 9;
        const isTfrCharge = e.description.toLowerCase().includes('tfr charge');

        return isSmallAmount || isTfrCharge;
    };

    const debitsToAggregate = mappedEntries.filter(isAggregatableDebit);
    const otherEntries = mappedEntries.filter(e => !isAggregatableDebit(e));

    if (debitsToAggregate.length > 0) {
        const totalAggregatedAmount = debitsToAggregate.reduce((sum, e) => sum + (e.creditAmount as number), 0);
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


    // 3. Sort the entries: first by accountNo, then by journal name (CRNOTE > STVINV), then by posting date.
    otherEntries.sort((a, b) => {
        if (a.accountNo !== b.accountNo) {
            return a.accountNo.localeCompare(b.accountNo);
        }
        if (a.journalName !== b.journalName) {
            if (a.journalName === 'STVINV') return -1;
            if (b.journalName === 'STVINV') return 1;
            return a.journalName.localeCompare(b.journalName);
        }
        return new Date(a.postingDate).getTime() - new Date(b.postingDate).getTime();
    });

    // 4. Finalize the entries by iterating over the sorted list to assign sequential numbers and format dates.
    const finalOfficialAccountName = bankInfo ? bankInfo.accountName : accountName;
    // Shorten account name prefix to 4 chars to save space for Invoice No (Limit 20)
    const shortAccountName = finalOfficialAccountName.split(' ')[0].toUpperCase().substring(0, 4);
    let lineNumCounter = 0;
    let currentJournalNum = 0;
    let lastAccountNo = '';
    let lastJournalName = '';
    const seenInvoices = new Set<string>();

    return otherEntries.map((entry, index) => {
        if (entry.accountNo !== lastAccountNo || entry.journalName !== lastJournalName) {
            currentJournalNum++;
            lastAccountNo = entry.accountNo;
            lastJournalName = entry.journalName;
            lineNumCounter = 1;
        } else {
            lineNumCounter++;
        }

        const invoiceCounter = index + 1;
        const date = new Date(entry.postingDate);
        // FIX 1: Add timeZone: 'UTC' so Kuwaiti users (GMT+3) don't get 'MAY' for a June 1st transaction
        const monthName = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
        const originalDescLower = entry.description.toLowerCase();

        // Updated Description logic
        let finalDescription = '';
        if (isPOS) {
            finalDescription = `${entry.accountNo} - POS Insurance & Utilities to mazaya Prime`;
        } else if (originalDescLower.includes("011010232800") || originalDescLower.includes("al mazaya prime")) {
            finalDescription = `${entry.accountNo}/Transfer from/to Al Mazaya Prime`;
        } else if (originalDescLower.includes("saving account profit")) {
            finalDescription = `${entry.accountNo}/Saving account profit Deposit`;
        } else if (entry.description === 'Aggregated Bank Charges and Fees') {
            finalDescription = entry.description;
        } else {
            const typeSuffix = entry.journalName === 'CRNOTE' ? 'TT' : 'PMT';
            // FIX 2 / 3: Use UTC year of the transaction (e.g. 26, 27) instead of hardcoding "26"
            const shortYear = date.getUTCFullYear() % 100;
            finalDescription = `${entry.accountNo}/INVESTOR-SLARY/${monthName}-${shortYear}/${typeSuffix}`;
        }

        // Target: "ACC-Sal-DD-MM-YYYY-0" - Length check to ensure <= 20 and unique
        const formattedDate = formatDateToDDMMYYYY(entry.postingDate);
        let generatedInvoiceNo = `${shortAccountName}-Sal-${formattedDate}-${invoiceCounter}`;
        if (generatedInvoiceNo.length > 20) {
            // Further truncate if counter is large
            generatedInvoiceNo = `${shortAccountName.substring(0, 2)}-S-${formattedDate}-${invoiceCounter}`;
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
            journalNumber: currentJournalNum,
            description: finalDescription,
            lineNum: lineNumCounter,
            numberOfVoucher: lineNumCounter,
            invoiceNo: finalInvoiceNo,
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

export async function convertToPOS49XLSX(data: JournalEntry[]): Promise<ArrayBuffer> {
    const header = OUTPUT_HEADER;
    const rows = data.map(entry => [
        entry.journalNumber,
        'GenJournal', // POS 49 requirement
        entry.lineNum,
        entry.postingDate,
        0, // Account Type: Ledger
        '2101432', // Account No: POS 49 specific
        entry.description,
        entry.creditAmount, // Debit Amount (swapped)
        entry.debitAmount, // Credit Amount (swapped)
        entry.currencyCode,
        entry.exchangeRate,
        1, // Offset account Type: Customer
        '49-000001', // Offset account
        '', // Invoice No: empty
        entry.documentNo, // Document No
        entry.documentDate,
        entry.dueDate,
        entry.assetTransType,
        '', // Posting Profile: empty
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
    const worksheet = workbook.addWorksheet("JournalEntriesPOS49");
    worksheet.addRow(header);
    rows.forEach(row => worksheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as ArrayBuffer;
}
