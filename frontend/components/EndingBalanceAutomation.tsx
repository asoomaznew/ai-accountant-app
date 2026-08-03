import React, { useState } from "react";
import FileUploader from "./FileUploader";
import { extractTextFromPdf } from "../services/pdfService";
import { getEndingBalanceFromText } from "../services/backendService";
import {
  SpinnerIcon,
  ProcessIcon,
  XCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
} from "./icons";
import ExcelJS from "exceljs";
import { downloadBlob } from '../utils/downloadHelper';

interface FileResult {
  file: File;
  status: "pending" | "processing" | "done" | "error";
  corporateName?: string;
  accountNumber?: string;
  endBalance?: string;
  errorMsg?: string;
}

const EndingBalanceAutomation: React.FC = () => {
  const [files, setFiles] = useState<FileResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFilesAdded = (newFiles: File[]) => {
    const validFiles = newFiles.filter(
      (file) => file.type === "application/pdf",
    );

    const fileResults: FileResult[] = validFiles.map((file) => ({
      file,
      status: "pending",
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
        const extractedInfo = await getEndingBalanceFromText(text);

        if (extractedInfo) {
          fileResult.status = "done";
          fileResult.corporateName = extractedInfo.corporateName;
          fileResult.accountNumber = extractedInfo.accountNumber;
          fileResult.endBalance = extractedInfo.endBalance;
        } else {
          fileResult.status = "error";
          fileResult.errorMsg = "Failed to extract required details.";
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

  const exportToExcel = async () => {
    const doneFiles = files.filter((f) => f.status === "done");
    if (doneFiles.length === 0) return;

    const data = doneFiles.map((f) => ({
      "File Name": f.file.name,
      "Corporate Name": f.corporateName,
      "Account Number": f.accountNumber,
      "End Balance": f.endBalance,
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Ending Balances");
    worksheet.columns = [
      { header: "File Name", key: "File Name" },
      { header: "Corporate Name", key: "Corporate Name" },
      { header: "Account Number", key: "Account Number" },
      { header: "End Balance", key: "End Balance" },
    ];
    data.forEach((row) => worksheet.addRow(row));

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await downloadBlob(blob, "Ending_Balances.xlsx");
  };

  return (
    <div className="bg-dark-100 rounded-xl p-6 border border-dark-300">
      <div className="mb-6 flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-xl font-bold text-slate-100 flex items-center">
          Ending Balance Extractor
        </h2>
        <div className="space-x-3 flex items-center">
          {files.some((f) => f.status === "done") && (
            <button
              onClick={exportToExcel}
              disabled={isProcessing}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors flex items-center font-medium shadow-sm"
            >
              <DownloadIcon className="w-4 h-4 mr-2" />
              Export Excel
            </button>
          )}

          <button
            onClick={clearFiles}
            disabled={isProcessing || files.length === 0}
            className="px-4 py-2 border border-dark-400 bg-dark-200 text-slate-300 rounded-lg hover:bg-dark-300 hover:text-white transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear List
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
                Extract Balance
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <FileUploader
          onFilesSelected={handleFilesAdded}
          isProcessing={isProcessing}
          acceptedMimeTypes={["application/pdf"]}
          acceptedExtensions={[".pdf"]}
          description="Statements Only (PDF)"
        />
      </div>

      {files.length > 0 && (
        <div className="overflow-hidden border border-dark-300 rounded-xl bg-dark-200 mb-8">
          <table className="w-full text-left text-sm">
            <thead className="bg-dark-300 text-slate-400 text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">File Name</th>
                <th className="px-6 py-4">Corporate Name</th>
                <th className="px-6 py-4">Account Number</th>
                <th className="px-6 py-4 text-right">End Balance</th>
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
                      <span className="flex items-center text-emerald-400">
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
                  <td className="px-6 py-4">{file.corporateName || "-"}</td>
                  <td className="px-6 py-4 font-mono">
                    {file.accountNumber || "-"}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-emerald-400">
                    {file.endBalance || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default EndingBalanceAutomation;
