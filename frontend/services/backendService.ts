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
    throw new Error("Ending Balance Extraction requires LLM providers. Please switch to WebLLM or wait for a future backend update.");
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
