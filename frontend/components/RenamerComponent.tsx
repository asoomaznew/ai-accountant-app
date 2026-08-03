import React, { useState, useCallback } from "react";
import JSZip from "jszip";
import PQueue from "p-queue";
import { downloadBlob } from '../utils/downloadHelper';
import FileUploader from "./FileUploader";
import SettingsPanel from "./SettingsPanel";
import ActionButtons from "./ActionButtons";
import ResultsTable from "./ResultsTable";
import LogArea from "./LogArea";
import {
  extractTextFromPdfWithPageNumbers,
  extractTextFromImage,
} from "../services/pdfService";
import { extractTextFromExcel } from "../services/excelService";
import { getNewFilename } from "../services/renameService";
import {
  RenameMethod,
  type ProcessedFile,
  FileProcessStatus,
  type LogEntry,
} from "../types";

const RenamerComponent: React.FC = () => {
  const [results, setResults] = useState<ProcessedFile[]>([]);
  const [renameMethod, setRenameMethod] = useState<RenameMethod>(
    RenameMethod.AI,
  );
  const [customPattern, setCustomPattern] = useState<string>(
    "Invoice No:\\s*([A-Z0-9-]+)",
  );
  const [aiInstructions, setAiInstructions] = useState<string>(
    "From the document text, find the primary identifier such as an invoice number, account number, or reference ID. The filename should be clean and not contain spaces or special characters, use hyphens instead.",
  );
  const [aiSuffix, setAiSuffix] = useState<string>(
    "from 1-July to 20-july-2025",
  );
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback(
    (message: string, type: "info" | "error" | "success" = "info") => {
      setLogs((prev) => [
        ...prev,
        { id: Date.now() + Math.random(), message, type },
      ]);
    },
    [],
  );

  const handleFilesSelected = (files: File[]) => {
    if (files.length === 0) return;
    const newResults: ProcessedFile[] = files.map((file) => ({
      id: `${file.name}-${file.lastModified}`,
      originalFile: file,
      originalName: file.name,
      newName: "",
      status: FileProcessStatus.Idle,
    }));
    setResults(newResults);
    setLogs([]);
    addLog(`Loaded ${files.length} file(s). Ready for processing.`);
  };

  const clearAll = () => {
    setResults([]);
    setLogs([]);
  };

  const extractTextFromFile = (file: File): Promise<string> => {
    const fileName = file.name.toLowerCase();
    const fileType = file.type;

    if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
      return extractTextFromPdfWithPageNumbers(file).then((pages) =>
        pages.map((p) => p.text).join("\n"),
      );
    }

    const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".tiff", ".tif"];
    if (fileType.startsWith("image/") || imageExtensions.some((ext) => fileName.endsWith(ext))) {
      return extractTextFromImage(file);
    }

    const spreadsheetTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ];
    const spreadsheetExtensions = [".xls", ".xlsx", ".csv"];

    if (
      spreadsheetTypes.includes(fileType) ||
      spreadsheetExtensions.some((ext) => fileName.endsWith(ext))
    ) {
      return extractTextFromExcel(file);
    }

    return Promise.reject(new Error(`Unsupported file type: ${file.name}`));
  };

  const handleDownloadZip = useCallback(async (currentResults: ProcessedFile[]) => {
    const filesToZip = currentResults.filter(
      (r) => r.status === FileProcessStatus.Success,
    );
    if (filesToZip.length === 0) {
      addLog("No files were successfully renamed to include in a ZIP.", "error");
      return;
    }

    addLog(`Creating ZIP archive with ${filesToZip.length} files...`);
    setIsProcessing(true);

    try {
      const zip = new JSZip();
      const nameCounts: { [key: string]: number } = {};

      for (const result of filesToZip) {
        let finalName = result.newName;
        if (nameCounts[finalName] != null) {
          const count = nameCounts[finalName];
          const lastDotIndex = finalName.lastIndexOf(".");

          if (lastDotIndex !== -1) {
            const nameWithoutExt = finalName.substring(0, lastDotIndex);
            const extension = finalName.substring(lastDotIndex);
            finalName = `${nameWithoutExt}_${count}${extension}`;
          } else {
            finalName = `${finalName}_${count}`;
          }
          nameCounts[result.newName]++;
        } else {
          nameCounts[result.newName] = 1;
        }
        zip.file(finalName, result.originalFile);
      }

      const content = await zip.generateAsync({ type: "blob" });
      await downloadBlob(content, `renamed_files_${Date.now()}.zip`);
      addLog("ZIP file download initiated.", "success");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown ZIP error occurred.";
      addLog(`Failed to create ZIP file: ${errorMessage}`, "error");
    } finally {
      setIsProcessing(false);
    }
  }, [addLog]);

  const processFiles = useCallback(
    async (previewOnly: boolean) => {
      if (results.length === 0) {
        addLog("No files to process. Please upload files first.", "error");
        return;
      }

      setIsProcessing(true);
      if (previewOnly) {
        addLog(`Starting rename PREVIEW (Concurrent Processing with p-queue)...`);
      } else {
        addLog(`Starting file processing for download (Concurrent Processing with p-queue)...`);
      }

      // Instantiate queue with concurrency of 3
      const queue = new PQueue({ concurrency: 3 });

      const tasks = results.map((result, idx) => async () => {
        addLog(`Processing file ${idx + 1}/${results.length}: ${result.originalName}`);
        
        setResults((prev) =>
          prev.map((x) =>
            x.id === result.id ? { ...x, status: FileProcessStatus.Processing } : x
          )
        );

        try {
          const text = await extractTextFromFile(result.originalFile);
          if (!text) {
            throw new Error("Could not extract text from file.");
          }

          const newNameStr = await getNewFilename(
            text,
            renameMethod,
            {
              customPattern,
              aiInstructions,
              aiSuffix,
            },
          );

          if (!newNameStr) {
            throw new Error("AI returned empty name.");
          }

          setResults((prev) =>
            prev.map((x) =>
              x.id === result.id
                ? { ...x, status: FileProcessStatus.Success, newName: newNameStr }
                : x
            )
          );
          addLog(`Successfully renamed to: ${newNameStr}`, "success");
        } catch (error: any) {
          setResults((prev) =>
            prev.map((x) =>
              x.id === result.id ? { ...x, status: FileProcessStatus.Error } : x
            )
          );
          addLog(
            `Failed to process ${result.originalName}: ${error?.message || error}`,
            "error",
          );
        }
      });

      await queue.addAll(tasks);

      addLog("Processing complete.");
      setIsProcessing(false);

      if (!previewOnly) {
        // We retrieve the updated results reference to zip correctly
        setResults((latestResults) => {
          handleDownloadZip(latestResults);
          return latestResults;
        });
      }
    },
    [results, renameMethod, customPattern, aiInstructions, aiSuffix, addLog, handleDownloadZip],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            1. Upload Files
          </h2>
          <FileUploader
            onFilesSelected={handleFilesSelected}
            isProcessing={isProcessing}
          />
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            2. Configure
          </h2>
          <SettingsPanel
            renameMethod={renameMethod}
            setRenameMethod={setRenameMethod}
            customPattern={customPattern}
            setCustomPattern={setCustomPattern}
            aiInstructions={aiInstructions}
            setAiInstructions={setAiInstructions}
            aiSuffix={aiSuffix}
            setAiSuffix={setAiSuffix}
            isProcessing={isProcessing}
          />
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            3. Action
          </h2>
          <ActionButtons
            onPreview={() => processFiles(true)}
            onDownload={() => processFiles(false)}
            onClear={clearAll}
            isProcessing={isProcessing}
            hasFiles={results.length > 0}
          />
        </div>
      </div>
      <div className="lg:col-span-8">
        <div className="bg-dark-200 p-1 rounded-lg border border-dark-300 min-h-[600px] flex flex-col">
          <div className="flex-grow">
            <ResultsTable results={results} />
          </div>
          <div className="flex-shrink-0 border-t border-dark-300">
            <LogArea logs={logs} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default RenamerComponent;
