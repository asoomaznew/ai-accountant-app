import React, { useState } from "react";
import FileUploader from "./FileUploader";
import { getAnswerFromText } from "../services/backendService";
import {
  DocumentMagnifyingGlassIcon,
  TrashIcon,
  PrinterIcon,
  SparklesIcon,
} from "./icons";
import * as pdfjsLib from "pdfjs-dist";
import { extractTextFromPdfWithPageNumbers } from "../services/pdfService";

export interface QaResult {
  fileName: string;
  file: File;
  question: string;
  answer: string;
  pages: number[];
}

export interface QaResultCardProps {
  result: QaResult;
  onPrint: (file: File, pages: number[], fileName: string) => void;
}

export const QaResultCard: React.FC<QaResultCardProps> = ({ result, onPrint }) => {
  return (
    <div className="bg-dark-300/50 rounded-lg border border-dark-300 animate-fade-in">
      <h4 className="font-semibold text-slate-200 p-4 border-b border-dark-300">
        {result.fileName}
      </h4>
      <div className="p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-slate-400">Your Question:</p>
          <p className="text-slate-200 mt-1">"{result.question}"</p>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-400">Gemini's Answer:</p>
          <p className="text-slate-200 mt-1 whitespace-pre-wrap">
            {result.answer}
          </p>
        </div>
        {result.pages.length > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-400">Source Pages:</p>
            <div className="flex items-center space-x-2 mt-1">
              <p className="text-sm text-sky-400">{result.pages.join(", ")}</p>
              <button
                onClick={() =>
                  onPrint(result.file, result.pages, result.fileName)
                }
                className="flex items-center text-xs px-2 py-1 bg-sky-900/70 text-sky-300 rounded hover:bg-sky-900 transition-colors"
                title={`Print cited pages`}
              >
                <PrinterIcon className="w-4 h-4 mr-1" /> Print Cited Pages
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PdfQaComponent: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<QaResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [statusText, setStatusText] = useState(
    "Upload PDFs and ask a question to begin.",
  );

  const handleFilesSelected = (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setResults([]);
    setStatusText(`Loaded ${selectedFiles.length} PDF(s).`);
  };

  const clearAll = () => {
    setFiles([]);
    setQuestion("");
    setResults([]);
    setIsSearching(false);
    setStatusText("Upload PDFs and ask a question to begin.");
  };

  const handleAsk = async () => {
    if (files.length === 0 || !question.trim()) {
      setStatusText("Please select files and ask a question.");
      return;
    }
    setIsSearching(true);
    setResults([]);

    const allResults: QaResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatusText(
        `Asking Gemini about file ${i + 1} of ${files.length}: ${file.name}... This may take a moment.`,
      );

      try {
        const pagesText = await extractTextFromPdfWithPageNumbers(file);
        if (pagesText.length === 0) {
          throw new Error("Could not extract any text from the PDF.");
        }
        const { answer, pages } = await getAnswerFromText(pagesText, question);

        allResults.push({
          fileName: file.name,
          file,
          question,
          answer,
          pages,
        });
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
        allResults.push({
          fileName: file.name,
          file,
          question,
          answer: `Error processing this file: ${error instanceof Error ? error.message : "Unknown error"}`,
          pages: [],
        });
      }

      setResults([...allResults]);

      // Add a delay between API calls to avoid rate-limiting
      if (i < files.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1-second delay
      }
    }

    setIsSearching(false);
    setStatusText(`Analysis complete for ${allResults.length} file(s).`);
  };

  const handlePrint = async (file: File, pages: number[], fileName: string) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups for this site to print.");
      return;
    }

    printWindow.document.write(`
            <html>
                <head>
                    <title>Printing - ${fileName}</title>
                    <style>
                        @media print {
                            @page { margin: 0; size: auto; }
                            body { margin: 0; }
                            canvas { width: 100%; page-break-after: always; }
                            #loader { display: none; }
                        }
                        body { margin: 0; background-color: #333; font-family: sans-serif; }
                        #loader { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); color: white; display: flex; align-items: center; justify-content: center; font-size: 2em; }
                        canvas { display: block; margin: 1em auto; max-width: 100%; height: auto; border: 1px solid #555; }
                    </style>
                </head>
                <body>
                    <div id="loader">Preparing pages for printing...</div>
                    <div id="container"></div>
                </body>
            </html>
        `);
    printWindow.document.close();

    try {
      const arrayBuffer = await file.arrayBuffer();
      const typedarray = new Uint8Array(arrayBuffer.slice(0));
      const pdf = await pdfjsLib.getDocument(typedarray).promise;
      const container = printWindow.document.getElementById("container")!;

      for (const pageNum of pages) {
        if (pageNum > 0 && pageNum <= pdf.numPages) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = printWindow.document.createElement("canvas");
          const context = canvas.getContext("2d")!;
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          // FIX: Cast to any to satisfy the RenderParameters type for this version of pdf.js.
          await page.render({ canvasContext: context, viewport, canvas } as any)
            .promise;
          container.appendChild(canvas);
        }
      }

      printWindow.document.getElementById("loader")!.style.display = "none";

      printWindow.focus();
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    } catch (error) {
      console.error("Print mapping error:", error);
      printWindow.document.getElementById("loader")!.innerText = "Error preparing pages.";
      setTimeout(() => printWindow.close(), 3000);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            1. Upload PDFs
          </h2>
          <FileUploader
            onFilesSelected={handleFilesSelected}
            isProcessing={isSearching}
            acceptedMimeTypes={["application/pdf"]}
            acceptedExtensions={[".pdf"]}
            description="PDF files only"
          />
          {files.length > 0 && (
            <div className="mt-4 text-sm text-slate-300">
              <h3 className="font-semibold mb-1">Selected files:</h3>
              <ul className="list-disc list-inside">
                {files.map((f) => (
                  <li key={f.name} className="truncate">
                    {f.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            2. Ask a Question
          </h2>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isSearching}
            rows={4}
            className="w-full bg-dark-300 border-dark-300/50 rounded-md shadow-sm p-2 text-slate-200 focus:ring-sky-500 focus:border-sky-500"
            placeholder="e.g., What is the total invoice amount?"
          />
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            3. Execute
          </h2>
          <div className="space-y-4">
            <button
              onClick={handleAsk}
              disabled={isSearching || files.length === 0 || !question.trim()}
              className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-white bg-sky-600 hover:bg-sky-700 focus:ring-sky-500"
            >
              <SparklesIcon className="-ml-1 mr-2 h-5 w-5" />
              {isSearching ? "Thinking..." : "Ask Gemini"}
            </button>
            <button
              onClick={clearAll}
              disabled={isSearching}
              className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md shadow-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 disabled:opacity-50 text-slate-400 hover:bg-dark-300 hover:text-slate-200"
            >
              <TrashIcon className="-ml-1 mr-2 h-5 w-5" />
              Clear All
            </button>
          </div>
        </div>
      </div>
      <div className="lg:col-span-8">
        <div className="bg-dark-200 p-1 rounded-lg border border-dark-300 min-h-[600px] flex flex-col">
          <div className="p-4 border-b border-dark-300">
            <h3 className="text-lg font-semibold text-slate-200">Results</h3>
            <p className="text-sm text-slate-400">{statusText}</p>
          </div>
          <div className="flex-grow overflow-y-auto p-4 space-y-4">
            {isSearching && results.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                Gemini is analyzing the documents...
              </div>
            )}
            {!isSearching && results.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
                <DocumentMagnifyingGlassIcon className="w-16 h-16 mb-4" />
                <h3 className="text-xl font-semibold text-slate-400">
                  Ready for your questions
                </h3>
                <p>Answers from Gemini will appear here.</p>
              </div>
            )}
            {results.map((res) => (
              <QaResultCard
                key={res.fileName}
                result={res}
                onPrint={handlePrint}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfQaComponent;
