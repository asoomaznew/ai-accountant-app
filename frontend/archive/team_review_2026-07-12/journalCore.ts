import { ExtractedData, JournalEntry } from '../types';
import * as XLSX from 'xlsx';
import { OUTPUT_HEADER } from '../constants';
import {
    WARBA_BANK_INFO,
    WARBA_VENDOR_OFFSET_ACCOUNTS,
} from '../warbaConstants';
import {
    CLOVER_BANK_INFO,
    VENDOR_OFFSET_ACCOUNTS,
    ACCOUNT_NO_TO_OFFSET_MAPPING,
} from '../constants';

// ─────────────────────────────────────────────────────────────
//  Public types
// ─────────────────────────────────────────────────────────────

export type BankType = 'warba' | 'merchant';

export interface JournalConfig {
    bankType: BankType;
    bankInfo: any[];
    vendorOffsetAccounts: Record<string, string>;
    /** Optional override map for account-number → offset-account */
    accountNoToOffsetMapping?: Record<string, string>;
    /** Optional lookup used when vendorOffsetAccounts key is a normalized account name */
    normalizeAccountName?: (name: string) => string;
}

export interface GenerateJournalEntriesOptions {
    /** Clover-only: force a specific offset account on every entry */
    forcedOffsetAccount?: string;
    /** Clover-only: treat all transactions as POS (overrides journal name/number) */
    isPOS?: boolean;
    /** Allow callers to pass a custom offset-accounts map (overrides config default) */
    offsetAccounts?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
//  Helpers — dates, account numbers, names, amounts
// ─────────────────────────────────────────────────────────────

export function formatDateToDDMMYYYY(isoDate: string): string {
    try {
        const date = new Date(isoDate);
        if (isNaN(date.getTime())) return isoDate;
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day}-${month}-${year}`;
    } catch {
        return isoDate;
    }
}

export function normalizeAcc(acc: string | undefined): string {
    if (!acc) return '';
    return acc.replace(/^0+/, '').trim();
}

export function normalizeAmount(amount: number): number {
    const numericAmount = Number(amount);
    return Number.isFinite(numericAmount) ? Math.abs(numericAmount) : amount;
}

/**
 * Default account-name normalizer used by the Warba side. Strips clinic/polyclinic
 * suffixes and punctuation so vendor maps can be matched loosely.
 */
export function defaultNormalizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+(polyclinic|polyclinics|polyclinc|center|clinic)\s*/g, ' ')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '-');
}

// ─────────────────────────────────────────────────────────────
//  Per-bank configurations
// ─────────────────────────────────────────────────────────────

const WARBA_JOURNAL_CONFIG: JournalConfig = {
    bankType: 'warba',
    bankInfo: WARBA_BANK_INFO,
    vendorOffsetAccounts: WARBA_VENDOR_OFFSET_ACCOUNTS,
    normalizeAccountName: defaultNormalizeName,
};

const MERCHANT_JOURNAL_CONFIG: JournalConfig = {
    bankType: 'merchant',
    bankInfo: CLOVER_BANK_INFO,
    vendorOffsetAccounts: VENDOR_OFFSET_ACCOUNTS,
    accountNoToOffsetMapping: ACCOUNT_NO_TO_OFFSET_MAPPING,
};

// ─────────────────────────────────────────────────────────────
//  Resolve bank-info + offset-account for a given account
// ─────────────────────────────────────────────────────────────

function resolveBankInfo(config: JournalConfig, accountNumber: string) {
    const normAcc = normalizeAcc(accountNumber);
    return config.bankInfo.find((info) => {
        const check1 = normalizeAcc(info.accountNo) === normAcc;
        const check2 = info.oldAccountNo
            ? normalizeAcc(info.oldAccountNo) === normAcc
            : false;
        return check1 || check2;
    });
}

function resolveBaseOffsetAccount(
    config: JournalConfig,
    bankInfo: any,
    accountName: string,
    finalJournalAccountNo: string,
    activeOffsetAccounts: Record<string, string>,
    forcedOffsetAccount?: string,
): string {
    // 1) Forced override always wins.
    if (forcedOffsetAccount) return forcedOffsetAccount;

    // 2) Warba style: match by normalized account name against vendor map.
    if (config.normalizeAccountName) {
        const normalizedAccountName = config.normalizeAccountName(
            bankInfo ? bankInfo.accountName : accountName,
        );

        const activeNormalizedOffsetAccounts: Record<string, string> =
            Object.entries(activeOffsetAccounts).reduce((acc, [key, val]) => {
                acc[config.normalizeAccountName!(key)] = val;
                return acc;
            }, {} as Record<string, string>);

        if (activeNormalizedOffsetAccounts[normalizedAccountName]) {
            return activeNormalizedOffsetAccounts[normalizedAccountName];
        }

        const offsetAccountKey = Object.keys(activeNormalizedOffsetAccounts)
            .sort((a, b) => b.length - a.length)
            .find(
                (key) =>
                    normalizedAccountName.includes(key) || key.includes(normalizedAccountName),
            );
        if (offsetAccountKey) return activeNormalizedOffsetAccounts[offsetAccountKey];

        return 'N/A';
    }

    // 3) Merchant (Clover) style: direct lookup by account name, then by account no.
    if (bankInfo && activeOffsetAccounts[bankInfo.accountName]) {
        return activeOffsetAccounts[bankInfo.accountName];
    }
    if (config.accountNoToOffsetMapping) {
        return (
            config.accountNoToOffsetMapping[finalJournalAccountNo] || '50-000001'
        );
    }
    return '50-000001';
}

// ─────────────────────────────────────────────────────────────
//  Transaction-level corrections (overrides the AI-returned type)
// ─────────────────────────────────────────────────────────────

function correctTransactionType(
    transaction: ExtractedData['transactions'][number],
    bankType: BankType,
): ExtractedData['transactions'][number] {
    const correctedTransaction = { ...transaction };
    correctedTransaction.amount = normalizeAmount(transaction.amount);
    const lower = correctedTransaction.description.toLowerCase();
    const numericAmount = Number(correctedTransaction.amount);

    // Warba side: full set of credit-overriding keywords.
    if (bankType === 'warba') {
        if (
            lower.includes('deposit') ||
            lower.includes('transfer from') ||
            lower.includes('incoming') ||
            lower.includes('profit') ||
            lower.includes('interest')
        ) {
            correctedTransaction.type = 'credit';
        }
    }

    if (Number.isFinite(numericAmount) && numericAmount < 0) {
        correctedTransaction.type = 'debit';
    }

    if (lower.includes('pos purchase')) {
        correctedTransaction.type = 'debit';
    }

    if (lower.includes('salary credit') || lower.includes('salary charges')) {
        correctedTransaction.type = 'debit';
    }

    return correctedTransaction;
}

// ─────────────────────────────────────────────────────────────
//  Filtering — drop transactions that should never become entries
// ─────────────────────────────────────────────────────────────

function shouldKeepTransaction(
    transaction: ExtractedData['transactions'][number],
    bankType: BankType,
): boolean {
    const lower = transaction.description.toLowerCase();

    // Merchant side drops debit "fees" entries.
    if (
        bankType === 'merchant' &&
        transaction.type === 'debit' &&
        lower.includes('fees')
    ) {
        return false;
    }

    return (
        !lower.includes('transfer deposit knet') &&
        !lower.includes('merchant rcon pay') &&
        !lower.includes('merchant fee') &&
        !lower.includes('transfer withdrawal rental fee')
    );
}

// ─────────────────────────────────────────────────────────────
//  Per-transaction offset account overrides
// ─────────────────────────────────────────────────────────────

function resolveTransactionOffsetAccount(
    baseOffsetAccount: string,
    description: string,
): { account: string; type: number } {
    const lower = description.toLowerCase();
    let account = baseOffsetAccount;
    let type = 2; // default

    if (lower.includes('011010232800') || lower.includes('al mazaya prime')) {
        account = '50-000001';
    } else if (lower.includes('saving account profit')) {
        account = 'M52708';
        type = 0;
    }

    return { account, type };
}

// ─────────────────────────────────────────────────────────────
//  Per-bank journal naming & debit/credit conventions
// ─────────────────────────────────────────────────────────────

function resolveJournalMeta(
    bankType: BankType,
    isCredit: boolean,
    isPOS: boolean,
): { journalNumber: number; journalName: string } {
    if (bankType === 'merchant') {
        if (isPOS) return { journalNumber: 2, journalName: 'CRNOTE' };
        return isCredit
            ? { journalNumber: 2, journalName: 'CRNOTE' }
            : { journalNumber: 1, journalName: 'STVINV' };
    }
    // warba
    return isCredit
        ? { journalNumber: 2, journalName: 'CRNOTE' }
        : { journalNumber: 1, journalName: 'STVINV' };
}

// ─────────────────────────────────────────────────────────────
//  Aggregating small bank charges and "TFR Charge" rows
// ─────────────────────────────────────────────────────────────

function isAggregatableDebit(entry: any): boolean {
    const isDebit = entry.journalName === 'STVINV' || entry.journalName === 'CRNOTE';
    if (!isDebit || entry.creditAmount === '') return false;

    const creditAmount =
        typeof entry.creditAmount === 'number' ? Math.abs(entry.creditAmount) : 0;
    const isSmallAmount = creditAmount > 0 && creditAmount <= 9;
    const isTfrCharge = entry.description.toLowerCase().includes('tfr charge');

    return isSmallAmount || isTfrCharge;
}

// ─────────────────────────────────────────────────────────────
//  Entry building
// ─────────────────────────────────────────────────────────────

function buildPreliminaryEntries(
    transactions: ExtractedData['transactions'],
    config: JournalConfig,
    data: ExtractedData,
    finalJournalAccountNo: string,
    bankInfo: any,
    baseOffsetAccount: string,
    options: GenerateJournalEntriesOptions,
): any[] {
    return transactions.map((transaction) => {
        const postingDate = transaction.date;
        const isCredit = transaction.type === 'credit';
        const lowerDesc = transaction.description.toLowerCase();

        const { account: transactionOffsetAccount, type: transactionOffsetAccountType } =
            resolveTransactionOffsetAccount(baseOffsetAccount, transaction.description);

        const { journalNumber, journalName } = resolveJournalMeta(
            config.bankType,
            isCredit,
            options.isPOS ?? false,
        );

        // Merchant/POS flips debit/credit assignment.
        const finalDebitAmount =
            options.isPOS ?? false
                ? transaction.amount
                : isCredit
                    ? transaction.amount
                    : '';
        const finalCreditAmount =
            options.isPOS ?? false
                ? ''
                : isCredit
                    ? ''
                    : transaction.amount;

        return {
            journalNumber,
            journalName,
            postingDate,
            accountType: 6,
            accountNo: finalJournalAccountNo,
            description: transaction.description,
            debitAmount: finalDebitAmount,
            creditAmount: finalCreditAmount,
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
            // placeholders
            lineNum: 0,
            numberOfVoucher: 0,
            invoiceNo: '',
        };
    });
}

function aggregateSmallDebits(entries: any[]): any[] {
    const debitsToAggregate = entries.filter(isAggregatableDebit);
    const otherEntries = entries.filter((e) => !isAggregatableDebit(e));

    if (debitsToAggregate.length === 0) return otherEntries;

    const totalAggregatedAmount = debitsToAggregate.reduce(
        (sum, e) => sum + Math.abs(e.creditAmount as number),
        0,
    );
    const latestDate = new Date(
        Math.max(
            ...debitsToAggregate.map((t) => new Date(t.postingDate).getTime()),
        ),
    );
    const latestDateString = latestDate.toISOString().split('T')[0];

    const aggregatedDebitEntry = {
        ...debitsToAggregate[0],
        postingDate: latestDateString,
        documentDate: latestDateString,
        dueDate: latestDateString,
        description: 'Aggregated Bank Charges and Fees',
        debitAmount: '',
        creditAmount: totalAggregatedAmount,
    };
    otherEntries.push(aggregatedDebitEntry);
    return otherEntries;
}

function sortEntries(entries: any[]): any[] {
    return entries.sort((a, b) => {
        if (a.journalName !== b.journalName) {
            if (a.journalName === 'STVINV') return -1;
            if (b.journalName === 'STVINV') return 1;
            return a.journalName.localeCompare(b.journalName);
        }
        return new Date(a.postingDate).getTime() - new Date(b.postingDate).getTime();
    });
}

// ─────────────────────────────────────────────────────────────
//  Finalisation — assign line numbers, invoice numbers, format dates
// ─────────────────────────────────────────────────────────────

function buildFinalDescription(
    entry: any,
    bankType: BankType,
    isPOS: boolean,
): string {
    const lower = entry.description.toLowerCase();
    if (bankType === 'merchant' && isPOS) {
        return `${entry.accountNo} - POS Insurance & Utilities to mazaya Prime`;
    }
    if (lower.includes('011010232800') || lower.includes('al mazaya prime')) {
        return `${entry.accountNo}/Transfer from/to Al Mazaya Prime`;
    }
    if (lower.includes('saving account profit')) {
        return `${entry.accountNo}/Saving account profit Deposit`;
    }
    if (entry.description === 'Aggregated Bank Charges and Fees') {
        return entry.description;
    }
    const date = new Date(entry.postingDate);
    const monthName = date
        .toLocaleString('en-US', { month: 'short' })
        .toUpperCase();
    const typeSuffix = entry.journalName === 'CRNOTE' ? 'TT' : 'PMT';
    return `${entry.accountNo}/INVESTOR-SLARY/${monthName}-26/${typeSuffix}`;
}

function buildInvoiceNo(
    entry: any,
    shortAccountName: string,
    invoiceCounter: number,
    bankType: BankType,
    seenInvoices: Set<string>,
): string {
    let generatedInvoiceNo: string;
    if (bankType === 'warba') {
        const date = new Date(entry.postingDate);
        const monthName = date
            .toLocaleString('en-US', { month: 'short' })
            .toUpperCase();
        generatedInvoiceNo = `${shortAccountName}-Sal-${monthName}-${invoiceCounter}`;
        if (generatedInvoiceNo.length > 20) {
            generatedInvoiceNo = `${shortAccountName.substring(0, 3)}-S-${monthName.substring(0, 3)}-${invoiceCounter}`;
        }
    } else {
        // merchant style: use the formatted DD-MM-YYYY date
        const formattedDate = formatDateToDDMMYYYY(entry.postingDate);
        generatedInvoiceNo = `${shortAccountName}-Sal-${formattedDate}-${invoiceCounter}`;
        if (generatedInvoiceNo.length > 20) {
            generatedInvoiceNo = `${shortAccountName.substring(0, 2)}-S-${formattedDate}-${invoiceCounter}`;
        }
    }

    let finalInvoiceNo = generatedInvoiceNo.substring(0, 20);
    let suffix = 1;
    while (seenInvoices.has(finalInvoiceNo)) {
        const base =
            generatedInvoiceNo.length > 17 ? generatedInvoiceNo.substring(0, 17) : generatedInvoiceNo;
        finalInvoiceNo = `${base}-${suffix}`.substring(0, 20);
        suffix++;
    }
    seenInvoices.add(finalInvoiceNo);
    return finalInvoiceNo;
}

function finalizeEntries(
    entries: any[],
    config: JournalConfig,
    officialAccountName: string,
    isPOS: boolean,
): JournalEntry[] {
    const shortAccountName = officialAccountName
        .split(' ')[0]
        .toUpperCase()
        .substring(0, 4);

    // For warba, lineNum tracks within a journalName group; for merchant, within a journalNumber group.
    const useJournalNumber = config.bankType === 'merchant';
    const groupKey = (e: any) => (useJournalNumber ? e.journalNumber : e.journalName);

    let lastGroupKey: string | number = useJournalNumber ? -1 : '';
    let lineNumCounter = 0;
    const seenInvoices = new Set<string>();

    return entries.map((entry, index) => {
        const currentGroupKey = groupKey(entry);
        if (currentGroupKey !== lastGroupKey) {
            lastGroupKey = currentGroupKey;
            lineNumCounter = 1;
        } else {
            lineNumCounter++;
        }

        const invoiceCounter = index + 1;
        const finalDescription = buildFinalDescription(entry, config.bankType, isPOS);
        const finalInvoiceNo = buildInvoiceNo(
            entry,
            shortAccountName,
            invoiceCounter,
            config.bankType,
            seenInvoices,
        );

        return {
            ...entry,
            description: finalDescription,
            lineNum: lineNumCounter,
            numberOfVoucher: lineNumCounter,
            invoiceNo: finalInvoiceNo,
            postingDate: formatDateToDDMMYYYY(entry.postingDate),
            documentDate: formatDateToDDMMYYYY(entry.documentDate),
            dueDate: formatDateToDDMMYYYY(entry.dueDate),
        };
    });
}

// ─────────────────────────────────────────────────────────────
//  Main public entry point
// ─────────────────────────────────────────────────────────────

function getJournalConfig(bankType: BankType): JournalConfig {
    return bankType === 'warba' ? WARBA_JOURNAL_CONFIG : MERCHANT_JOURNAL_CONFIG;
}

export function generateJournalEntriesCore(
    data: ExtractedData,
    config: JournalConfig,
    options: GenerateJournalEntriesOptions = {},
): JournalEntry[] {
    const { accountName, accountNumber, transactions } = data;
    if (!transactions || transactions.length === 0) return [];

    // 1) Correct transaction type based on description keywords.
    const correctedTransactions = transactions.map((t) =>
        correctTransactionType(t, config.bankType),
    );

    // 2) Look up bank info for the account number.
    const bankInfo = resolveBankInfo(config, accountNumber);
    if (!bankInfo) {
        console.warn(
            `Could not find matching bank info for account number: ${accountNumber}. Some fields may be 'N/A'.`,
        );
    }
    const finalJournalAccountNo = bankInfo ? bankInfo.accountNo : accountNumber;
    const officialAccountName = bankInfo ? bankInfo.accountName : accountName;

    // 3) Resolve base offset account.
    const activeOffsetAccounts = options.offsetAccounts ?? config.vendorOffsetAccounts;
    const baseOffsetAccount = resolveBaseOffsetAccount(
        config,
        bankInfo,
        accountName,
        finalJournalAccountNo,
        activeOffsetAccounts,
        options.forcedOffsetAccount,
    );

    if (config.bankType === 'warba' && baseOffsetAccount === 'N/A') {
        console.warn(`Could not find matching offset account for: ${officialAccountName}`);
    }

    // 4) Filter out transactions that should be ignored.
    const filteredTransactions = correctedTransactions.filter((t) =>
        shouldKeepTransaction(t, config.bankType),
    );
    if (filteredTransactions.length === 0) return [];

    // 5) Build preliminary entry structure.
    const preliminaryEntries = buildPreliminaryEntries(
        filteredTransactions,
        config,
        data,
        finalJournalAccountNo,
        bankInfo,
        baseOffsetAccount,
        options,
    );

    // 6) Aggregate small bank charges.
    const aggregatedEntries = aggregateSmallDebits(preliminaryEntries);

    // 7) Sort.
    const sortedEntries = sortEntries(aggregatedEntries);

    // 8) Finalize.
    return finalizeEntries(
        sortedEntries,
        config,
        officialAccountName,
        options.isPOS ?? false,
    );
}

// Convenience re-export of the two concrete configs so callers can grab them
// without recomputing the bankType string.
export const JOURNAL_CONFIGS: Record<BankType, JournalConfig> = {
    warba: WARBA_JOURNAL_CONFIG,
    merchant: MERCHANT_JOURNAL_CONFIG,
};

export { getJournalConfig };

// ─────────────────────────────────────────────────────────────
//  XLSX output
// ─────────────────────────────────────────────────────────────

export function convertToXLSX(data: JournalEntry[]): ArrayBuffer {
    const header = OUTPUT_HEADER;
    const rows = data.map((entry) => [
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
    ]);

    const worksheetData = [header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'JournalEntries');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function convertToPOS49XLSX(data: JournalEntry[]): ArrayBuffer {
    const header = OUTPUT_HEADER;
    const rows = data.map((entry) => [
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
    ]);

    const worksheetData = [header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'JournalEntriesPOS49');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}