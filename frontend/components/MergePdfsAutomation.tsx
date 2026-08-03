import React, { useState, useMemo } from "react";
import FileUploader from "./FileUploader";
import { extractTextFromPdf } from "../services/pdfService";
import {
  SpinnerIcon,
  ProcessIcon,
  XCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
} from "./icons";
import { PDFDocument } from "pdf-lib";
import { downloadBlob } from '../utils/downloadHelper';
import JSZip from "jszip";
import { CLOVER_BANK_INFO, WARBA_BANK_INFO } from "../constants";

const ALL_BANK_INFO = [...CLOVER_BANK_INFO, ...WARBA_BANK_INFO];

function normalizeAccountStr(raw: string) {
  if (!raw) return "";
  return raw.replace(/[^a-zA-Z0-9-]/g, "");
}

function resolveAccountNumber(rawNumber: string) {
  const cleanNum = normalizeAccountStr(rawNumber);
  const found = ALL_BANK_INFO.find(
    (info) =>
      normalizeAccountStr(info.accountNo) === cleanNum ||
      (info.oldAccountNo &&
        normalizeAccountStr(info.oldAccountNo) === cleanNum),
  );
  return found ? found.accountNo : rawNumber;
}

function fastExtractAccountDetails(text: string, filename: string): { resolvedAccount: string, corporateName: string, accountNumber: string } | null {
  const normalizedText = text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const normalizedFilename = filename.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  
  // 1. Exact match in filename
  for (const info of ALL_BANK_INFO) {
    if (info.accountNo) {
      const cleanAcc = info.accountNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (normalizedFilename.includes(cleanAcc)) {
        return {
          resolvedAccount: info.accountNo,
          corporateName: info.accountName,
          accountNumber: info.oldAccountNo || info.accountNo
        };
      }
    }
    if (info.oldAccountNo) {
      const cleanOld = info.oldAccountNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (normalizedFilename.includes(cleanOld)) {
        return {
          resolvedAccount: info.accountNo,
          corporateName: info.accountName,
          accountNumber: info.oldAccountNo
        };
      }
    }
  }

  // 2. Extracted 4-5 digit code from filename
  const filenameNumberMatch = filename.match(/(?:^|[^0-9])(\d{4,5})(?:[^0-9]|$)/);
  if (filenameNumberMatch) {
    const code = filenameNumberMatch[1];
    for (const info of ALL_BANK_INFO) {
      if (info.accountNo && info.accountNo.endsWith(code)) {
         return {
          resolvedAccount: info.accountNo,
          corporateName: info.accountName,
          accountNumber: info.oldAccountNo || info.accountNo
        };
      }
      if (info.oldAccountNo && info.oldAccountNo.endsWith(code)) {
         return {
          resolvedAccount: info.accountNo,
          corporateName: info.accountName,
          accountNumber: info.oldAccountNo
        };
      }
    }
  }

  // 3. Exact match in document text
  for (const info of ALL_BANK_INFO) {
    if (info.accountNo) {
      const cleanAcc = info.accountNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (normalizedText.includes(cleanAcc)) {
        return {
          resolvedAccount: info.accountNo,
          corporateName: info.accountName,
          accountNumber: info.oldAccountNo || info.accountNo
        };
      }
    }
    if (info.oldAccountNo) {
      const cleanOld = info.oldAccountNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (normalizedText.includes(cleanOld)) {
        return {
          resolvedAccount: info.accountNo,
          corporateName: info.accountName,
          accountNumber: info.oldAccountNo
        };
      }
    }
  }

  // 4. Fallback: random 10-14 digit number in filename
  const fallbackFilenameMatch = filename.match(/\b\d{10,14}\b/);
  if (fallbackFilenameMatch) {
    return {
      resolvedAccount: fallbackFilenameMatch[0],
      corporateName: "N/A",
      accountNumber: fallbackFilenameMatch[0]
    };
  }

  // 5. Fallback: random 10-14 digit number in text
  const fallbackMatch = text.match(/\b\d{10,14}\b/);
  if (fallbackMatch) {
    return {
      resolvedAccount: fallbackMatch[0],
      corporateName: "N/A",
      accountNumber: fallbackMatch[0]
    };
  }

  return null;
}

interface FileResult {
  file: File;
  status: "pending" | "processing" | "done" | "error";
  documentType?: string;
  resolvedAccount?: string;
  corporateName?: string;
  accountNumber?: string;
  errorMsg?: string;
}

const MergePdfsAutomation: React.FC = () => {
  const [files, setFiles] = useState<FileResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  const handleFilesAdded = (
    newFiles: File[],
    type: "statement" | "reconciliation",
  ) => {
    const validFiles = newFiles.filter(
      (file) => file.type === "application/pdf",
    );

    const fileResults: FileResult[] = validFiles.map((file) => ({
      file,
      status: "pending",
      documentType: type,
    }));

    setFiles((prev) => [...prev, ...fileResults]);
  };

  const processFiles = async () => {
    setIsProcessing(true);

    const newFiles = [...files];
    for (let i = 0; i < newFiles.length; i++) {
      if (newFiles[i].status !== "pending" && newFiles[i].status !== "error")
        continue;

      const fileResult = { ...newFiles[i] };
      fileResult.status = "processing";

      newFiles[i] = fileResult;
      setFiles([...newFiles]);

      try {
        const text = await extractTextFromPdf(fileResult.file);
        const extractedDetails = fastExtractAccountDetails(text, fileResult.file.name);

        if (extractedDetails) {
          fileResult.status = "done";
          fileResult.resolvedAccount = resolveAccountNumber(extractedDetails.resolvedAccount);
          fileResult.corporateName = extractedDetails.corporateName;
          fileResult.accountNumber = extractedDetails.accountNumber;
        } else {
          fileResult.status = "error";
          fileResult.errorMsg = "Unmatched: Could not find account number.";
        }
      } catch (error) {
        console.error("Error processing file", fileResult.file.name, error);
        fileResult.status = "error";
        fileResult.errorMsg =
          error instanceof Error ? error.message : "Unknown error";
      }

      newFiles[i] = fileResult;
      setFiles([...newFiles]);
    }

    setIsProcessing(false);
  };

  const clearFiles = () => {
    if (isProcessing) return;
    setFiles([]);
  };

  const matchedGroups = useMemo(() => {
    const groups: Record<
      string,
      { statements: FileResult[]; reconciliations: FileResult[] }
    > = {};

    const doneFiles = files.filter(
      (f) => f.status === "done" && f.resolvedAccount,
    );
    doneFiles.forEach((f) => {
      const acc = f.resolvedAccount!;
      if (!groups[acc]) {
        groups[acc] = { statements: [], reconciliations: [] };
      }

      if (f.documentType === "reconciliation") {
        groups[acc].reconciliations.push(f);
      } else {
        groups[acc].statements.push(f);
      }
    });

    return Object.entries(groups).filter(
      ([acc, group]) =>
        group.statements.length > 0 && group.reconciliations.length > 0,
    );
  }, [files]);

  const unmatchedStatements = useMemo(() => {
    return files.filter(f => f.documentType === "statement" && (f.status === "error" || (f.status === "done" && !matchedGroups.some(([acc, group]) => group.statements.includes(f)))));
  }, [files, matchedGroups]);

  const unmatchedReconciliations = useMemo(() => {
    return files.filter(f => f.documentType === "reconciliation" && (f.status === "error" || (f.status === "done" && !matchedGroups.some(([acc, group]) => group.reconciliations.includes(f)))));
  }, [files, matchedGroups]);

  const generateMergedPdfBlob = async (
    statements: FileResult[],
    reconciliations: FileResult[],
  ): Promise<Blob> => {
    const mergedPdf = await PDFDocument.create();

    for (const recon of reconciliations) {
      const arrayBuffer = await recon.file.arrayBuffer();
      const srcDoc = await PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(
        srcDoc,
        srcDoc.getPageIndices(),
      );
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    for (const stmt of statements) {
      const arrayBuffer = await stmt.file.arrayBuffer();
      const srcDoc = await PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(
        srcDoc,
        srcDoc.getPageIndices(),
      );
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const pdfBytes = await mergedPdf.save();
    return new Blob([pdfBytes], { type: "application/pdf" });
  };

  const downloadMergedPdf = async (
    account: string,
    statements: FileResult[],
    reconciliations: FileResult[],
  ) => {
    setIsMerging(true);
    try {
      const blob = await generateMergedPdfBlob(statements, reconciliations);
      await downloadBlob(blob, `Merged_Recon_Stmt_${account}.pdf`);
    } catch (err) {
      console.error("Failed to merge PDFs:", err);
      alert("Failed to merge PDFs. Please try again.");
    }
    setIsMerging(false);
  };

  const printMergedPdf = async (
    account: string,
    statements: FileResult[],
    reconciliations: FileResult[],
  ) => {
    setIsMerging(true);
    try {
      const blob = await generateMergedPdfBlob(statements, reconciliations);
      const url = URL.createObjectURL(blob);

      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          
          // Cleanup after print dialog is opened
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(url);
            setIsMerging(false);
          }, 1000);
        }, 500);
      };
    } catch (err) {
      console.error("Failed to merge & print PDFs:", err);
      alert("Failed to merge & print PDFs. Please try again.");
      setIsMerging(false);
    }
  };

  const downloadAllMergedPdfsZip = async () => {
    if (matchedGroups.length === 0) return;
    setIsMerging(true);
    try {
      const zip = new JSZip();
      
      for (const [account, group] of matchedGroups) {
        const blob = await generateMergedPdfBlob(group.statements, group.reconciliations);
        zip.file(`Merged_Recon_Stmt_${account}.pdf`, blob);
      }
      
      const zipBlob = await zip.generateAsync({ type: "blob" });
      await downloadBlob(zipBlob, "Merged_Reconciliations.zip");
    } catch (err) {
      console.error("Failed to zip PDFs:", err);
      alert("Failed to zip PDFs. Please try again.");
    }
    setIsMerging(false);
  };

  return (
    <div className="bg-dark-100 rounded-xl p-6 border border-dark-300">
      <div className="mb-6 flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-xl font-bold text-slate-100 flex items-center">
          Match & Merge Bank Statements and Reconciliations
        </h2>
        <div className="space-x-3 flex items-center">
          {matchedGroups.length > 0 && (
            <button
              onClick={downloadAllMergedPdfsZip}
              disabled={isMerging}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors text-sm font-medium flex items-center shadow-sm shadow-indigo-900/20"
            >
              {isMerging ? (
                <><SpinnerIcon className="w-4 h-4 mr-2 animate-spin" /> Zipping...</>
              ) : (
                <><DownloadIcon className="w-4 h-4 mr-2" /> Download Merged ZIP</>
              )}
            </button>
          )}
          <button
            onClick={clearFiles}
            disabled={isProcessing || files.length === 0}
            className="px-4 py-2 border border-dark-400 bg-dark-200 text-slate-300 rounded-lg hover:bg-dark-300 hover:text-white transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
          <button
            onClick={processFiles}
            disabled={
              isProcessing ||
              files.filter(
                (f) => f.status === "pending" || f.status === "error",
              ).length === 0
            }
            className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-500 transition-colors flex items-center font-medium shadow-sm shadow-sky-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <SpinnerIcon className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <ProcessIcon className="w-4 h-4 mr-2" />
                Process & Match
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-2 text-slate-300">
            1. Upload Bank Statements
          </h3>
          <FileUploader
            onFilesSelected={(f) => handleFilesAdded(f, "statement")}
            isProcessing={isProcessing}
            acceptedMimeTypes={["application/pdf"]}
            acceptedExtensions={[".pdf"]}
            description="Statements Only (PDF)"
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2 text-slate-300">
            2. Upload Bank Reconciliations
          </h3>
          <FileUploader
            onFilesSelected={(f) => handleFilesAdded(f, "reconciliation")}
            isProcessing={isProcessing}
            acceptedMimeTypes={["application/pdf"]}
            acceptedExtensions={[".pdf"]}
            description="Reconciliations Only (PDF)"
          />
        </div>
      </div>

      {files.length > 0 && (
        <div className="overflow-hidden border border-dark-300 rounded-xl bg-dark-200 mb-8">
          <table className="w-full text-left text-sm">
            <thead className="bg-dark-300 text-slate-400 text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">File Name</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Detected Account</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-300 text-slate-300">
              {files.map((file, i) => (
                <tr key={i} className="hover:bg-dark-200/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {file.status === "pending" && (
                      <span className="flex items-center text-slate-400">
                        <ClockIcon className="w-4 h-4 mr-1.5" /> Pending
                      </span>
                    )}
                    {file.status === "processing" && (
                      <span className="flex items-center text-sky-400">
                        <SpinnerIcon className="w-4 h-4 mr-1.5 animate-spin" />{" "}
                        Processing
                      </span>
                    )}
                    {file.status === "done" && (
                      <span
                        className="flex items-center text-emerald-400"
                      >
                        <CheckCircleIcon className="w-4 h-4 mr-1.5" /> Done
                      </span>
                    )}
                    {file.status === "error" && (
                      <span
                        className="flex items-center text-rose-400"
                        title={file.errorMsg}
                      >
                        <XCircleIcon className="w-4 h-4 mr-1.5" /> Error
                      </span>
                    )}
                  </td>
                  <td
                    className="px-6 py-4 text-slate-200 truncate max-w-xs"
                    title={file.file.name}
                  >
                    {file.file.name}
                  </td>
                  <td className="px-6 py-4 capitalize">
                    {file.documentType || "-"}
                  </td>
                  <td className="px-6 py-4 font-mono">
                    {file.resolvedAccount || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(files.length > 0) && (
        <div className="bg-dark-200 rounded-xl p-6 border border-dark-300 mb-8 mt-8">
          <h2 className="text-xl font-bold text-white mb-6">Processing Report</h2>
          
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-200 mb-2">1. Bank Statements with NO Matching Reconciliation</h3>
            {unmatchedStatements.length > 0 ? (
              <>
                <p className="text-sm text-slate-400 mb-4">There {unmatchedStatements.length === 1 ? "is 1 bank statement" : `are ${unmatchedStatements.length} bank statements`} that {unmatchedStatements.length === 1 ? "does" : "do"} not have a corresponding reconciliation file.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-dark-300 text-slate-400">
                      <tr>
                        <th className="px-4 py-2">Corporate Name</th>
                        <th className="px-4 py-2">Account Number</th>
                        <th className="px-4 py-2">File Name</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-300 text-slate-300">
                      {unmatchedStatements.map((f, i) => (
                         <tr key={i}>
                           <td className="px-4 py-2">{f.corporateName || "N/A"}</td>
                           <td className="px-4 py-2 font-mono">{f.accountNumber || "N/A"}</td>
                           <td className="px-4 py-2 max-w-[200px] truncate" title={f.file.name}>{f.file.name}</td>
                           <td className="px-4 py-2 text-rose-400">No Match Found</td>
                           <td className="px-4 py-2 flex justify-end">
                              <label className="cursor-pointer inline-flex items-center px-3 py-1 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 rounded text-xs font-medium transition-colors">
                                <span className="mr-1">+ Add Missing Recon</span>
                                <input 
                                   type="file" 
                                   className="hidden" 
                                   multiple
                                   accept="application/pdf"
                                   onChange={(e) => {
                                     if (e.target.files) {
                                       handleFilesAdded(Array.from(e.target.files), "reconciliation");
                                       e.target.value = "";
                                     }
                                   }} 
                                />
                              </label>
                           </td>
                         </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                 <p className="text-sm text-emerald-400 mb-4">All bank statements have been successfully matched. There are 0 unmatched statement records.</p>
                 <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-dark-300 text-slate-400">
                      <tr>
                        <th className="px-4 py-2">Corporate Name</th>
                        <th className="px-4 py-2">Account Number</th>
                        <th className="px-4 py-2">File Name</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-300 text-slate-300">
                         <tr>
                           <td className="px-4 py-2">N/A</td>
                           <td className="px-4 py-2">N/A</td>
                           <td className="px-4 py-2">None (All matched successfully)</td>
                           <td className="px-4 py-2 text-emerald-400">Fully Reconciled</td>
                         </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-slate-200 mb-2">2. Reconciliations with NO Matching Bank Statement</h3>
            {unmatchedReconciliations.length > 0 ? (
              <>
                <p className="text-sm text-slate-400 mb-4">There {unmatchedReconciliations.length === 1 ? "is 1 reconciliation file" : `are ${unmatchedReconciliations.length} reconciliation files`} that {unmatchedReconciliations.length === 1 ? "does" : "do"} not have a corresponding bank statement.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-dark-300 text-slate-400">
                      <tr>
                        <th className="px-4 py-2">Corporate Name</th>
                        <th className="px-4 py-2">Account Number</th>
                        <th className="px-4 py-2">File Name</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-300 text-slate-300">
                      {unmatchedReconciliations.map((f, i) => (
                         <tr key={i}>
                           <td className="px-4 py-2">{f.corporateName || "N/A"}</td>
                           <td className="px-4 py-2 font-mono">{f.accountNumber || "N/A"}</td>
                           <td className="px-4 py-2 max-w-[200px] truncate" title={f.file.name}>{f.file.name}</td>
                           <td className="px-4 py-2 text-rose-400">No Match Found</td>
                           <td className="px-4 py-2 flex justify-end">
                              <label className="cursor-pointer inline-flex items-center px-3 py-1 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 rounded text-xs font-medium transition-colors">
                                <span className="mr-1">+ Add Missing Statement</span>
                                <input 
                                   type="file" 
                                   className="hidden" 
                                   multiple
                                   accept="application/pdf"
                                   onChange={(e) => {
                                     if (e.target.files) {
                                       handleFilesAdded(Array.from(e.target.files), "statement");
                                       e.target.value = "";
                                     }
                                   }} 
                                />
                              </label>
                           </td>
                         </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                 <p className="text-sm text-emerald-400 mb-4">All reconciliation files have been successfully matched. There are 0 unmatched reconciliation records.</p>
                 <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-dark-300 text-slate-400">
                      <tr>
                        <th className="px-4 py-2">Corporate Name</th>
                        <th className="px-4 py-2">Account Number</th>
                        <th className="px-4 py-2">File Name</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-300 text-slate-300">
                         <tr>
                           <td className="px-4 py-2">N/A</td>
                           <td className="px-4 py-2">N/A</td>
                           <td className="px-4 py-2">None (All matched successfully)</td>
                           <td className="px-4 py-2 text-emerald-400">Fully Reconciled</td>
                         </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

        </div>
      )}

      {matchedGroups.length > 0 && (
        <div className="bg-dark-200 rounded-xl p-6 border border-dark-300">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-slate-100">
              Matched Bank Reconciliations & Statements
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matchedGroups.map(([account, group]) => (
              <div
                key={account}
                className="bg-dark-300 p-4 rounded-lg border border-dark-400"
              >
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-bold text-sky-400 font-mono text-lg">
                    {account}
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        downloadMergedPdf(
                          account,
                          group.statements,
                          group.reconciliations,
                        )
                      }
                      disabled={isMerging}
                      className="px-3 py-1 bg-dark-400 hover:bg-dark-100 text-white text-xs rounded transition-colors flex items-center"
                    >
                      <DownloadIcon className="w-3 h-3 mr-1" /> PDF
                    </button>
                    <button
                      onClick={() =>
                        printMergedPdf(
                          account,
                          group.statements,
                          group.reconciliations,
                        )
                      }
                      disabled={isMerging}
                      className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded transition-colors flex items-center"
                    >
                      <ProcessIcon className="w-3 h-3 mr-1" /> Print
                    </button>
                  </div>
                </div>
                <div className="text-sm">
                  <p className="text-slate-400 mb-1">
                    <span className="font-semibold text-slate-300">
                      {group.statements.length}
                    </span>{" "}
                    Statements
                  </p>
                  <ul className="list-disc pl-5 mb-2 text-slate-400">
                    {group.statements.map((s, idx) => (
                      <li key={idx} className="truncate" title={s.file.name}>
                        {s.file.name}
                      </li>
                    ))}
                  </ul>
                  <p className="text-slate-400 mb-1">
                    <span className="font-semibold text-slate-300">
                      {group.reconciliations.length}
                    </span>{" "}
                    Reconciliations
                  </p>
                  <ul className="list-disc pl-5 text-slate-400">
                    {group.reconciliations.map((r, idx) => (
                      <li key={idx} className="truncate" title={r.file.name}>
                        {r.file.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MergePdfsAutomation;

