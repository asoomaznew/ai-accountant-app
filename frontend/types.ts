export enum RenameMethod {
  BankAccount = "bank_account",
  Custom = "custom",
  AI = "ai",
  MedicalStatement = "medical_statement",
  MerchantReport = "merchant_report",
  ClinicReport = "clinic_report",
}

export enum FileProcessStatus {
  Idle = "Idle",
  Processing = "Processing",
  Success = "Success",
  Error = "Error",
  NoMatch = "No Match Found",
}

export interface ProcessedFile {
  id: string;
  originalFile: File;
  originalName: string;
  newName: string;
  status: FileProcessStatus;
  message?: string;
}

export type LogEntry = {
  id: number;
  message: string;
  type: 'info' | 'error' | 'success';
};

// --- Types for Merchant Entry Automation ---

export interface CloverBankInfo {
  accountName: string;
  oldAccountNo?: string;
  accountNo: string;
  activities: string;
  propertyId: string;
  country: string;
  departments: string;
  projectId: string;
}

export interface VendorOffsetAccounts {
  [key: string]: string;
}

export interface ExtractedTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
}

export interface ExtractedData {
    accountName: string;
    accountNumber: string;
    transactions: ExtractedTransaction[];
}

export interface JournalEntry {
  journalNumber: number;
  journalName: string;
  lineNum: number;
  postingDate: string;
  accountType: number;
  accountNo: string;
  description: string;
  debitAmount: number | string;
  creditAmount: number | string;
  currencyCode: string;
  exchangeRate: number;
  offsetAccountType: number;
  offsetAccount: string;
  invoiceNo: string;
  documentNo: string;
  documentDate: string;
  dueDate: string;
  assetTransType: string;
  postingProfile: string;
  paymentMode: string;
  paymentReference: string;
  numberOfVoucher: number;
  activities: string;
  country: string;
  departments: string;
  projectId: string;
  propertyId: string;
  unitId?: string;
}

export interface RawAccountingRow {
  [key: string]: string | number | Date | undefined;
}

export type AppMode =
  | "home"
  | "entry"
  | "rename"
  | "warba_entry"
  | "keyword_search"
  | "search"
  | "convert_001_to_49"
  | "ending_balance"
  | "merge_pdfs"
  | "pos_entry"
  | "pos_report"
  | "smart_merge"
  | "bahrain_cust_payment"
  | "ai_settings"
  | "v3_architecture";

