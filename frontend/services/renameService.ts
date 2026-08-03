import { RenameMethod } from '../types';
import { getAiName, getShortenedSuffix, getMedicalStatementFilename } from './backendService';

// Helper to parse simple CSV text. Handles comma or tab delimiters.
const parseCsv = (text: string): string[][] => {
    if (!text) return [];
    const delimiter = text.includes('\t') ? '\t' : ',';
    const rows = text.trim().split('\n');
    return rows.filter(row => row.trim() !== '').map(row => row.split(delimiter));
};

const extractMerchantReportFilename = (text: string): string | null => {
    const data = parseCsv(text);
    if (data.length < 2) return null; // Needs header + at least one data row

    const header = data[0].map(h => h.trim().toLowerCase());
    const dataRow = data[1];

    const terminalIdIdx = header.indexOf('terminal id');
    const merchantNumIdx = header.indexOf('merchant number');
    const merchantNameIdx = header.indexOf('merchant name');

    if (terminalIdIdx === -1 || merchantNumIdx === -1 || merchantNameIdx === -1) {
        return null;
    }

    const terminalId = dataRow[terminalIdIdx]?.trim();
    const merchantNum = dataRow[merchantNumIdx]?.trim();
    const merchantName = dataRow[merchantNameIdx]?.trim();

    if (merchantName && merchantNum && terminalId) {
        return `${merchantName}-${merchantNum}-Terminal ${terminalId}`;
    }

    return null;
};

const extractClinicReportFilename = (text: string): string | null => {
    const data = parseCsv(text);
    if (data.length < 1) return null;

    const header = data[0].map(h => h.trim().toLowerCase());
    const nameIdx = header.indexOf('name');
    const accountNumIdx = header.indexOf('account number');

    // Case 1: Header row exists
    if (nameIdx !== -1 && accountNumIdx !== -1 && data.length > 1) {
        const dataRow = data[1];
        const name = dataRow[nameIdx]?.trim();
        const accountNum = dataRow[accountNumIdx]?.trim();

        if (name && accountNum) {
            return `${name}-${accountNum}`;
        }
    }

    // Case 2: No header, assume first row is data `Name, AccountNumber`
    const firstRow = data[0];
    if (firstRow.length >= 2) {
        const name = firstRow[0]?.trim();
        const accountNum = firstRow[1]?.trim();
        // A simple check to see if it looks like data not a header
        if (name && accountNum && name.toLowerCase() !== 'name' && accountNum.toLowerCase() !== 'account number') {
             return `${name}-${accountNum}`;
        }
    }

    return null;
};


const extractBankAccountCode = (text: string): string | null => {
  // Pattern: 'Bank account' followed by ':' on the same line, then the code
  const pattern1 = /Bank\s+account\s*:\s*([A-Za-z0-9\-_]+)/i;
  const match1 = text.match(pattern1);
  if (match1 && match1[1]) {
    return match1[1].trim();
  }

  // Alternative: 'bank account' on one line, code on the next
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('bank account')) {
      // Check same line for code after colon
      if (lines[i].includes(':')) {
        const codePart = lines[i].split(':')[1];
        if (codePart) {
          const codeMatch = codePart.match(/([A-Za-z0-9\-_]+)/);
          if (codeMatch && codeMatch[1]) return codeMatch[1];
        }
      }
      // Check next line
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const codeMatch = nextLine.match(/^([A-Za-z0-9\-_]+)$/); // Match if the whole line is the code
        if (codeMatch && codeMatch[1]) {
          return codeMatch[1];
        }
      }
    }
  }

  return null;
};

const extractCustomPattern = (text: string, pattern: string): string | null => {
  if (!pattern) {
    throw new Error("Custom pattern is not provided.");
  }
  // FIX 9: guard against overly long user-supplied patterns (ReDoS mitigation)
  if (pattern.length > 1000) {
    throw new Error("Custom pattern is too long (max 1000 characters).");
  }
  try {
    const regex = new RegExp(pattern, 'i');
    const matches = text.match(regex);
    if (matches) {
      // Return the first capturing group if it exists, otherwise the full match
      return (matches[1] || matches[0]).trim();
    }
    return null;
  } catch (e) {
    throw new Error("Invalid Regular Expression provided.");
  }
};

const sanitizeFilename = (name: string): string => {
  // Remove invalid filename characters, replace spaces with hyphens
  return name.replace(/[\s/\\?%*:|"<>]/g, '-').replace(/--+/g, '-');
};

export const getNewFilename = async (
  text: string,
  method: RenameMethod,
  options: { customPattern?: string; aiInstructions?: string; aiSuffix?: string }
): Promise<string | null> => {
  let newName: string | null = null;

  switch (method) {
    case RenameMethod.BankAccount:
      newName = extractBankAccountCode(text);
      break;
    case RenameMethod.Custom:
      if (!options.customPattern) throw new Error("Custom pattern is required.");
      newName = extractCustomPattern(text, options.customPattern);
      break;
    case RenameMethod.AI: {
      if (!options.aiInstructions) throw new Error("AI instructions are required.");
      // Limiting text sent to AI to first 50000 chars for performance and cost, leveraging Flash context
      const truncatedText = text.substring(0, 50000); 
      newName = await getAiName(truncatedText, options.aiInstructions);
      break;
    }
    case RenameMethod.MedicalStatement: {
      const truncatedText = text.substring(0, 50000); 
      newName = await getMedicalStatementFilename(truncatedText);
      break;
    }
    case RenameMethod.MerchantReport:
      newName = extractMerchantReportFilename(text);
      break;
    case RenameMethod.ClinicReport:
      newName = extractClinicReportFilename(text);
      break;
    default:
      throw new Error("Invalid renaming method specified.");
  }

  if (newName) {
    const sanitizedBaseName = sanitizeFilename(newName);
    
    if (method === RenameMethod.AI && options.aiSuffix) {
        const shortSuffix = await getShortenedSuffix(options.aiSuffix);
        const sanitizedSuffix = sanitizeFilename(shortSuffix);
        if (sanitizedSuffix) {
            return `${sanitizedBaseName}-${sanitizedSuffix}`;
        }
    }
    return sanitizedBaseName;
  }

  return null;
};
