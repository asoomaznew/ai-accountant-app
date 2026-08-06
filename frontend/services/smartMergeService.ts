import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import Papa from 'papaparse';
import { BATCH_MAPPING } from '../constants';

import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ProcessingResult {
  fileName: string;
  blob: Blob;
  matched: boolean;
  matchedCsvRows: number;
  matchedEmailsCount?: number;
  matchedEmailNames?: string[];
}

interface BatchData {
  name: string;
  descId: string;
  pages: number[];
  fullText: string;
}

async function appendCsvPages(outputPdf: PDFDocument, matchedRows: any[], batchName: string) {
  const font = await outputPdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await outputPdf.embedFont(StandardFonts.HelveticaBold);

  if (matchedRows.length === 0) return;

  const colWidths = [120, 95, 45, 95, 80, 55, 75, 65, 75, 57];
  const headers = [
    "Merchant Name", "Account Number", "MCC", "KNET Reference", "KNET POS Date",
    "Amount", "Commission%", "Commission", "Net Amount", "Card Type"
  ];

  const pageWidth = 842;
  const pageHeight = 595;
  const marginX = 40;
  const marginY = 40;
  const contentWidth = pageWidth - (marginX * 2); // 762 PT

  let page = outputPdf.addPage([pageWidth, pageHeight]);
  let currentY = pageHeight - marginY;

  const drawPageHeader = (pNum: number) => {
    // Title on top left (matching screenshot)
    page.drawText("Matched POS Transactions", {
      x: marginX,
      y: currentY - 10,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    // Subtitle indicating batch name
    page.drawText(`Batch: ${batchName}`, {
      x: marginX,
      y: currentY - 24,
      size: 8,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Page indicator on top right
    page.drawText(`Page ${pNum}`, {
      x: pageWidth - marginX - 40,
      y: currentY - 10,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });

    currentY -= 45;

    // Table Header Row - draw labels in Helvetica Bold
    let curX = marginX;
    headers.forEach((h, hIdx) => {
      page.drawText(h, {
        x: curX,
        y: currentY - 10,
        size: 8,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      curX += colWidths[hIdx];
    });

    currentY -= 15;

    // Line under headers matching the screenshot
    page.drawLine({
      start: { x: marginX, y: currentY },
      end: { x: pageWidth - marginX, y: currentY },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });

    currentY -= 15;
  };

  let pageIndex = 1;
  drawPageHeader(pageIndex);

  // Helper mapper to get values correctly from columns
  const extractCsvRowData = (row: any) => {
    const keys = Object.keys(row);
    const getVal = (regex: RegExp) => {
      const k = keys.find(key => regex.test(key));
      return k ? String(row[k] || '').trim() : '';
    };

    const merchantName = getVal(/Merchant\s*Name|Merch\s*Name/i) || getVal(/Description|Desc/i) || getVal(/Shop|Vendor|Customer/i);
    const accountNumber = getVal(/Account\s*(?:Number|No\.?|#|Id|Num|No)|Iban/i) || getVal(/^Acc$/i) || getVal(/Acc\s*No/i);
    const mcc = getVal(/MCC/i) || getVal(/Category/i);
    const knetReference = getVal(/KNET\s*Reference/i) || getVal(/KNET\s*Ref/i) || getVal(/Trace|Auth/i) || getVal(/Ref|Reference/i);
    const knetPosDate = getVal(/POS\s*Date/i) || getVal(/KNET\s*Date/i) || getVal(/Date/i) || getVal(/Time/i);

    const amtKey = keys.find(k => {
      const kl = k.toLowerCase();
      return (kl.includes('amount') || kl.includes('amt')) && !kl.includes('net') && !kl.includes('commission') && !kl.includes('comm') && !kl.includes('fee') && !kl.includes('%');
    }) || keys.find(k => /^[^\w]*amount[^\w]*$/i.test(k) || /^[^\w]*amt[^\w]*$/i.test(k));
    const amount = amtKey ? String(row[amtKey] || '').trim() : '';

    const commissionPct = getVal(/Commission\s*%/i) || getVal(/Comm\s*%/i) || getVal(/Fee\s*%/i);

    const commKey = keys.find(k => {
      const kl = k.toLowerCase();
      return (kl.includes('commission') || kl.includes('comm') || kl.includes('fee')) && !kl.includes('%');
    });
    const commission = commKey ? String(row[commKey] || '').trim() : '';

    const netAmount = getVal(/Net\s*(?:Amount|Amt)/i) || getVal(/Net/i);
    const cardType = getVal(/Card\s*Type|Card/i) || getVal(/Type/i);

    return {
      merchantName,
      accountNumber,
      mcc,
      knetReference,
      knetPosDate,
      amount,
      commissionPct,
      commission,
      netAmount,
      cardType
    };
  };

  // Calculate Net Amount Total
  let totalNetSum = 0;
  matchedRows.forEach(row => {
    const data = extractCsvRowData(row);
    const valClean = data.netAmount.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(valClean);
    if (!isNaN(parsed)) {
      totalNetSum += parsed;
    }
  });

  const rowHeight = 22;

  // Render rows
  for (let rIdx = 0; rIdx < matchedRows.length; rIdx++) {
    const row = matchedRows[rIdx];
    const data = extractCsvRowData(row);

    if (currentY - rowHeight < marginY + 30) {
      page = outputPdf.addPage([pageWidth, pageHeight]);
      currentY = pageHeight - marginY;
      pageIndex++;
      drawPageHeader(pageIndex);
    }

    const vals = [
      data.merchantName,
      data.accountNumber,
      data.mcc,
      data.knetReference,
      data.knetPosDate,
      data.amount,
      data.commissionPct,
      data.commission,
      data.netAmount,
      data.cardType
    ];

    let curX = marginX;
    vals.forEach((valStr, vIdx) => {
      const colW = colWidths[vIdx];
      let drawText = valStr;

      // Truncate only string columns to avoid overlaps, but let numeric / date / status values display fully
      if (vIdx === 0 || vIdx === 1 || vIdx === 3) {
        const charLimit = Math.floor((colW - 8) / 4.5);
        if (drawText.length > charLimit && charLimit > 3) {
          drawText = drawText.substring(0, charLimit - 3) + '...';
        }
      }

      page.drawText(drawText, {
        x: curX,
        y: currentY - 12,
        size: 8,
        font: font,
        color: rgb(0.1, 0.1, 0.1),
      });
      curX += colW;
    });

    currentY -= rowHeight;
  }

  // Draw Total Row
  if (currentY - 30 < marginY) {
    page = outputPdf.addPage([pageWidth, pageHeight]);
    currentY = pageHeight - marginY;
    pageIndex++;
    drawPageHeader(pageIndex);
  }

  // Divider above totals
  page.drawLine({
    start: { x: marginX, y: currentY },
    end: { x: pageWidth - marginX, y: currentY },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  currentY -= 15;

  let curX = marginX;
  const colXPositions: number[] = [];
  colWidths.forEach(w => {
    colXPositions.push(curX);
    curX += w;
  });

  const commissionX = colXPositions[7];
  const netAmountX = colXPositions[8];

  page.drawText("Total", {
    x: commissionX,
    y: currentY - 10,
    size: 8,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  const formattedTotal = totalNetSum.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  page.drawText(formattedTotal, {
    x: netAmountX,
    y: currentY - 10,
    size: 8,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  currentY -= 15;

  // Secondary divider line under totals (accountant style)
  page.drawLine({
    start: { x: marginX, y: currentY },
    end: { x: pageWidth - marginX, y: currentY },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
}

export async function processFiles(
  mainPdfFile: File,
  bankStatements: File[],
  csvFiles: File[],
  emailPdfs: File[],
  onProgress: (msg: string) => void
): Promise<ProcessingResult[]> {
  onProgress("Loading PDF toolset...");
  const mainPdfBuffer = await mainPdfFile.arrayBuffer();
  // Pass a cloned buffer to pdf.js so the original buffer remains intact for pdf-lib
  const pdf = await pdfjsLib.getDocument({ data: mainPdfBuffer.slice(0) }).promise;
  const numPages = pdf.numPages;

  const batches: Record<string, BatchData> = {};
  let currentBatchNum = "Unknown_Batch";
  let currentDescId = "";
  let currentNameVal = "";

  onProgress("Analyzing pages...");
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Simple text extraction
    const text = textContent.items.map((item: any) => (item as any).str).join(' ');

    const batchRegex = /Journal batch number\s*[:]?\s*([A-Z0-9-]+)/i;
    const nameRegex = /Name\s*[:]?\s*([A-Z0-9_-]+)/i;
    const descRegex = /Description\s*[:]?\s*(.*?)(?:\s+Log|\s+Voucher)/i;
    const altDescMatch = text.match(/(CRNOTE-WR[A-Z]*\s*-?\s*\d{4,5})/i) || 
                         text.match(/(KIB[A-Z]*\s*-?\s*\d{4})/i) || 
                         text.match(/(WR[A-Z]*\s*-?\s*\d{4,5})/i) || 
                         text.match(/(WT[A-Z]*\s*-?\s*\d{4,5})/i);

    const batchMatch = text.match(batchRegex);
    
    let foundBatchNum = '';
    if (batchMatch) {
      foundBatchNum = batchMatch[1].trim();
    } else if (altDescMatch) {
      foundBatchNum = `Batch_${altDescMatch[0]}`;
    } else {
      foundBatchNum = currentBatchNum === "Unknown_Batch" ? `Batch_Page_${i}` : currentBatchNum;
    }

    if (foundBatchNum !== "Unknown_Batch" && foundBatchNum !== currentBatchNum && !foundBatchNum.startsWith('Batch_Page_')) {
       currentBatchNum = foundBatchNum;
    } else if (currentBatchNum === "Unknown_Batch" || currentBatchNum.startsWith('Batch_Page_')) {
       currentBatchNum = foundBatchNum;
    }

    const nameMatch = text.match(nameRegex);
    if (nameMatch) {
      currentNameVal = nameMatch[1].trim();
    }

    const descMatch = text.match(descRegex);
    if (descMatch) {
      currentDescId = descMatch[1].trim();
    } else if (altDescMatch) {
      currentDescId = altDescMatch[0];
    }

    let pageName = currentBatchNum;
    if (currentNameVal && currentDescId) {
      pageName = `${currentNameVal}-${currentDescId}`;
    } else if (currentDescId) {
      pageName = currentDescId;
    }

    if (!batches[currentBatchNum]) {
      batches[currentBatchNum] = {
        name: pageName,
        descId: currentDescId,
        pages: [],
        fullText: ""
      };
    }

    if ((batches[currentBatchNum].name === currentBatchNum || !batches[currentBatchNum].descId) && currentDescId) {
      batches[currentBatchNum].name = pageName;
      batches[currentBatchNum].descId = currentDescId;
    }

    batches[currentBatchNum].pages.push(i - 1);
    batches[currentBatchNum].fullText += "\n" + text;
  }

  // Aggregate CSV Data
  let aggregatedCsvData: any[] = [];
  for (const csv of csvFiles) {
    const text = await csv.text();
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    aggregatedCsvData = aggregatedCsvData.concat(result.data);
  }

  const results: ProcessingResult[] = [];
  const srcPdf = await PDFDocument.load(mainPdfBuffer);

  onProgress("Splitting and merging...");
  const batchEntries = Object.entries(batches);
  for (let idx = 0; idx < batchEntries.length; idx++) {
    const [batchNum, data] = batchEntries[idx];
    onProgress(`Processing batch ${idx + 1} of ${batchEntries.length}: ${data.name}`);

    const outputPdf = await PDFDocument.create();

    // Find matching bank statement
    let matchedBsFile: File | undefined;
    let last4 = '';
    const batchInfo = BATCH_MAPPING[batchNum];
    if (batchInfo) {
      last4 = batchInfo.last4;
    } else if (data.descId) {
      const match = data.descId.match(/(?:KIB|WR|WT|CRNOTE-WR)[A-Z]*\s*[- ]?\s*(\d{4,5})/i) || data.descId.match(/(\d{4,5})/);
      if (match) { 
        last4 = match[1].slice(-4);
        console.log(`Extracted last4: ${last4} from ID: ${data.descId}`);
      }
    }

    if (last4) {
      matchedBsFile = bankStatements.find(bs => 
        bs.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(last4.toLowerCase())
      );
      if (matchedBsFile) {
        console.log(`Matched statement: ${matchedBsFile.name} for last4: ${last4}`);
      }
    }
    
    if (!matchedBsFile && data.descId) {
      const normDesc = data.descId.toLowerCase().replace(/[^a-z0-9]/g, '');
      matchedBsFile = bankStatements.find(bs => 
        bs.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normDesc)
      );
    }

    // Match CSV data
    let matchedRows: any[] = [];
    if (aggregatedCsvData.length > 0) {
      const searchId = last4 || (data.descId ? (data.descId.match(/\d{4,5}/)?.[0]?.slice(-4) || "") : "");
      const pdfTextLower = data.fullText.toLowerCase();

      matchedRows = aggregatedCsvData.filter(row => {
        const accKey = Object.keys(row).find(k => /Account\s*(?:Number|No\.?|#|Id)|Iban|Acc/i.test(k)) || 'Account Number';
        const knetKey = Object.keys(row).find(k => /KNET\s*Reference|Reference|Ref|Trace|Auth/i.test(k)) || 'KNET Reference';
        const merchKey = Object.keys(row).find(k => /Merchant\s*Name|Name|Customer|Shop/i.test(k)) || 'Merchant Name';
        
        const rawAccNum = String(row[accKey] || '').trim();
        const rawKnetRef = String(row[knetKey] || '').trim();
        const rawMerchName = String(row[merchKey] || '').trim();
        
        const accNumNorm = rawAccNum.replace(/[^a-z0-9]/gi, '').toLowerCase();

        if (accNumNorm && accNumNorm.length > 3 && pdfTextLower.includes(accNumNorm)) return true;
        if (rawKnetRef && rawKnetRef.length > 3 && pdfTextLower.includes(rawKnetRef.toLowerCase())) return true;
        if (searchId && searchId.length >= 4 && (accNumNorm.endsWith(searchId) || rawKnetRef.includes(searchId))) return true;
        
        return false;
      });
    }

    // Match Email PDFs
    let matchedEmailFiles: File[] = [];
    if (emailPdfs.length > 0) {
      matchedEmailFiles = emailPdfs.filter(em => {
        const emLower = em.name.toLowerCase();
        // match by last4 or descId in filename
        if (last4 && emLower.includes(last4.toLowerCase())) return true;
        if (data.descId && emLower.includes(data.descId.toLowerCase())) return true;
        
        // Match by KNET reference from CSV
        if (matchedRows.length > 0) {
          for (const row of matchedRows) {
            const knetKey = Object.keys(row).find(k => /KNET\s*Reference|Reference|Ref|Trace|Auth/i.test(k)) || 'KNET Reference';
            const rawKnetRef = String(row[knetKey] || '').trim();
            if (rawKnetRef && rawKnetRef.length > 3 && emLower.includes(rawKnetRef.toLowerCase())) {
              return true;
            }
          }
        }
        return false;
      });
    }

    // Copy original pages
    const copiedMainPages = await outputPdf.copyPages(srcPdf, data.pages);
    copiedMainPages.forEach(p => outputPdf.addPage(p));

    let matched = false;
    if (matchedBsFile) {
      const bsBuffer = await matchedBsFile.arrayBuffer();
      const bsPdf = await PDFDocument.load(bsBuffer);
      const copiedBsPages = await outputPdf.copyPages(bsPdf, bsPdf.getPageIndices());
      copiedBsPages.forEach(p => outputPdf.addPage(p));
      matched = true;
    }

    // Append matched email PDFs
    for (const emFile of matchedEmailFiles) {
      const emBuffer = await emFile.arrayBuffer();
      const emPdf = await PDFDocument.load(emBuffer);
      const copiedEmPages = await outputPdf.copyPages(emPdf, emPdf.getPageIndices());
      copiedEmPages.forEach(p => outputPdf.addPage(p));
    }

    // append matched CSV transaction data pages to the PDF
    if (matchedRows.length > 0) {
      await appendCsvPages(outputPdf, matchedRows, data.name);
    }

    const pdfBytes = await outputPdf.save();
    const suffix = matched && matchedRows.length > 0 ? "_FullMatched" : matched ? "_StatementMatch" : matchedRows.length > 0 ? "_CSVMatch" : "";
    const fileName = `${data.name}${suffix}.pdf`.replace(/[\\/:*?"<>|]/g, "_").trim();
    
    results.push({
      fileName,
      blob: new Blob([pdfBytes], { type: 'application/pdf' }),
      matched,
      matchedCsvRows: matchedRows.length,
      matchedEmailsCount: matchedEmailFiles.length,
      matchedEmailNames: matchedEmailFiles.map(f => f.name)
    });
  }

  return results;
}
