import * as pdfjsLib from 'pdfjs-dist';
import { BAHRAIN_CUSTOMER_MASTER } from '../constants';

// Use the ESM version of the worker
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ExtractedRow {
  pdate: string;
  unit: string;
  ccode: string;
  cname: string;
  desc: string;
  amt: number;
  force: "Rent" | "EWA";
}

export interface ExtractedData {
  rows: ExtractedRow[];
}

export interface ProcessingResult {
  fileName: string;
  success: boolean;
  extractedData?: ExtractedData;
  error?: string;
}

async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let j = 1; j <= pdf.numPages; j++) {
    const page = await pdf.getPage(j);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map((item: any) => item.str).join(" ") + "\n";
  }
  return fullText;
}

export async function processBahrainFiles(
  files: File[],
  onProgress: (msg: string) => void
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress(`Processing ${i+1}/${files.length}: ${file.name}`);

    try {
      const fullText = await extractTextFromPdf(file);
      onProgress(`Analyzing ${file.name} with AI...`);

      const prompt = `You are an expert at extracting payment advice information from emails.
Analyze the following email text and extract the payment breakdown.
Email Text:
${fullText}
Available Customer Master (Unit -> Code/Name):
${JSON.stringify(BAHRAIN_CUSTOMER_MASTER, null, 2)}
Instructions: Identify the Customer Name and the Unit number/ID. Match the Unit with the exact key in the Available Customer Master. Extract each line item (usually Rent and EWA). For each item, extract the amount (number), the date (format DD-MM-YYYY), and the description. Set 'force' to "Rent" or "EWA" based on the description. Return ONLY a valid JSON object matching this schema:
{
  "rows": [
    {
      "pdate": "07-07-2026",
      "unit": "BHW1-C-9",
      "ccode": "24-000053",
      "cname": "WAED INDUSTRIAL INNOVATION COMPANY W.L.L",
      "desc": "Rent July 2026 Billing",
      "amt": 1188.00,
      "force": "Rent"
    }
  ]
}`;

      const response = await fetch('/api/bahrain/process', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('gemini_api_key') || 'local_bypass_token'}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: [file],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Backend error: ${errText}`);
      }

      const data = await response.json();
      results.push({
        fileName: file.name,
        success: true,
        extractedData: data.results[0].extractedData,
      });

    } catch (err: any) {
      let errMsg = err.message || String(err);
      results.push({
        fileName: file.name,
        success: false,
        error: errMsg,
      });
    }
  }

  return results;
}