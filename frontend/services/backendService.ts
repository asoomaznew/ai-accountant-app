// services/backendService.ts
// Routes file processing to the Python backend when provider = 'none'
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';

// FIX 5 / SECURITY: bypass token is only allowed in DEV. Production must supply
// a real token via VITE_BACKEND_TOKEN, otherwise the Authorization header is empty.
export const authHeader = (): string =>
  `Bearer ${import.meta.env.VITE_BACKEND_TOKEN ?? (import.meta.env.DEV ? 'local_bypass_token' : '')}`;

export interface BackendExtractedData {
  accountName: string;
  accountNumber: string;
  transactions: Array<{ date: string; description: string; amount: number; type: 'credit' | 'debit'; }>;
}

export const extractWithBackend = async (file: File): Promise<BackendExtractedData> => {
  const formData = new FormData();
  formData.append('files', file);
  const res = await fetch(`${BACKEND_URL}/api/extract-pos-data`, {
    method: 'POST', headers: { Authorization: authHeader() }, body: formData,
  });
  if (!res.ok) throw new Error(`Backend error ${res.status}: ${await res.text()}`);
  const json = await res.json() as Record<string, BackendExtractedData | { error: string }>;
  const result = json[file.name];
  if (!result) throw new Error(`No result returned for file: ${file.name}`);
  if ('error' in result) throw new Error(`Backend error for ${file.name}: ${result.error}`);
  return result as BackendExtractedData;
};

export const processStatementsWithBackend = async (files: File[]): Promise<Record<string, unknown>> => {
  const formData = new FormData();
  for (const file of files) formData.append('files', file);
  const res = await fetch(`${BACKEND_URL}/api/process-statements`, {
    method: 'POST', headers: { Authorization: authHeader() }, body: formData,
  });
  if (!res.ok) throw new Error(`Backend error ${res.status}: ${await res.text()}`);
  return res.json();
};

export async function getEndingBalanceFromText(text: string): Promise<any> {
    let corporateName = "Unknown";
    let accountNumber = "Unknown";
    let endBalance = "0.000";

    const nameMatch = text.match(/(?:Corporate|Customer|Account)?\s*Name\s*[:\-]?\s*([A-Za-z0-9_\- ]+?)(?=\n|\||\t|Account|Date|Currency|Branch)/i) ||
                      text.match(/Name\s*[:]?\s*([A-Za-z0-9_\- ]{3,50})/i);
    if (nameMatch) corporateName = nameMatch[1].trim();

    const accMatch = text.match(/Account\s*(?:Number|No\.?|#)\s*[:\-]?\s*([A-Z0-9\-]{5,30})/i) ||
                     text.match(/IBAN\s*[:\-]?\s*([A-Z0-9]{15,30})/i);
    if (accMatch) accountNumber = accMatch[1].trim();

    // The user's expected "End Balance" in their workflow is actually the "Beginning Balance" of the current statement
    // (which is the ending balance of the previous reconciliation period).
    // KIB statements often format this as: "Begining Balance End Balance 2,515.581 6,635.193"
    const beginBalanceMatch = text.match(/Beginn?ing\s+Balance[^0-9]*([\d,]+\.\d+)/i) || 
                              text.match(/Opening\s+Balance[^0-9]*([\d,]+\.\d+)/i);

    if (beginBalanceMatch) {
        endBalance = beginBalanceMatch[1].trim();
    } else {
        const closingBalanceMatch = text.match(/(?:Closing|Ending|Book|Available|Total|Current)\s*Balance\s*[:\-]?\s*(?:KWD|KD)?\s*([\d,]+\.\d+)/i) ||
                                    text.match(/Balance\s*[:\-]?\s*(?:KWD|KD)?\s*([\d,]+\.\d+)/i);
        if (closingBalanceMatch) {
            endBalance = closingBalanceMatch[1].trim();
        } else {
            const allAmounts = text.match(/[\d,]+\.\d{3}/g);
            if (allAmounts && allAmounts.length > 0) {
                endBalance = allAmounts[allAmounts.length - 1];
            }
        }
    }

    if (corporateName !== "Unknown" || accountNumber !== "Unknown" || endBalance !== "0.000") {
        return { corporateName, accountNumber, endBalance };
    }
    
    throw new Error("Could not deterministically extract Ending Balance from the provided text.");
};

export async function getAnswerFromText(context: any, question: string): Promise<{answer: string, pages: number[]}> {
    throw new Error("QA features require LLM providers. Please switch to WebLLM or wait for a future backend update.");
};

export async function getAiName(filename: string, instructions?: string): Promise<string> {
    return filename; // Dummy implementation
}

export async function getShortenedSuffix(suffix: string): Promise<string> {
    return suffix; // Dummy implementation
}

export async function getMedicalStatementFilename(text: string): Promise<string | null> {
    throw new Error("Medical statement renaming requires LLM providers.");
}

export const processMerchantWithBackend = async (file: File): Promise<any[]> => {
  const formData = new FormData();
  formData.append('files', file);
  const res = await fetch(`${BACKEND_URL}/api/process-merchant`, {
    method: 'POST', headers: { Authorization: authHeader() }, body: formData,
  });
  if (!res.ok) throw new Error(`Backend error ${res.status}: ${await res.text()}`);
  const json = await res.json() as Record<string, any[] | { error: string }>;
  const result = json[file.name];
  if (!result) throw new Error(`No result returned for file: ${file.name}`);
  if (!Array.isArray(result) && 'error' in result) throw new Error(`Backend error for ${file.name}: ${result.error}`);
  return result as any[];
};

export const pingBackend = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${BACKEND_URL}/`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
};
