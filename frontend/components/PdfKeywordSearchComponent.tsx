import React, { useState, useMemo, useRef } from "react";
import JSZip from "jszip";
import { downloadBlob } from '../utils/downloadHelper';
import * as pdfLib from "pdf-lib";
import { searchKeywordsInPdf, extractTextFromPdfWithPageNumbers } from "../services/pdfService";
import { getAnswerFromText } from "../services/backendService";
import FileUploader from "./FileUploader";
import { QaResult, QaResultCard } from "./PdfQaComponent";
import { KeywordSearchResult } from "../services/pdfService";
import {
  DocumentMagnifyingGlassIcon,
  TrashIcon,
  PrinterIcon,
  SparklesIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
} from "./icons";

interface KeywordSearchResults {
  [fileName: string]: {
    file: File;
    searchResult: KeywordSearchResult;
  };
}

interface KeywordResultCardProps {
  fileName: string;
  file: File;
  searchResult: KeywordSearchResult;
  onPrint: (jobs: { file: File; pages: number[]; fileName: string }[]) => void;
}

const KeywordResultCard: React.FC<KeywordResultCardProps> = ({
  fileName,
  file,
  searchResult,
  onPrint,
}) => {
  const allFoundPages = useMemo(() => {
    const pages = new Set<number>();
    Object.values(searchResult).forEach((pageArray: number[]) => {
      pageArray.forEach((p) => pages.add(p));
    });
    return Array.from(pages).sort((a, b) => a - b);
  }, [searchResult]);

  const maxPage = allFoundPages.length > 0 ? Math.max(...allFoundPages) : 0;

  const handlePrintSpecific = (pages: number[]) => {
    onPrint([{ file, pages, fileName }]);
  };

  const handlePrintRange = () => {
    if (maxPage > 0) {
      const pages = Array.from({ length: maxPage }, (_, i) => i + 1);
      onPrint([{ file, pages, fileName }]);
    }
  };

  return (
    <div className="bg-dark-300/50 rounded-lg border border-dark-300 animate-fade-in">
      <div className="flex justify-between items-center p-4 border-b border-dark-300">
        <h4 className="font-semibold text-slate-200 truncate">{fileName}</h4>
        {maxPage > 0 && (
          <button
            onClick={handlePrintRange}
            className="flex-shrink-0 flex items-center text-xs px-2 py-1 bg-sky-900/70 text-sky-300 rounded hover:bg-sky-900 transition-colors"
            title={`Print all pages from 1 to the last found page (${maxPage})`}
          >
            <PrinterIcon className="w-4 h-4 mr-1" /> Print all founded (1 →{" "}
            {maxPage})
          </button>
        )}
      </div>
      <div className="p-4 space-y-3">
        {Object.entries(searchResult).map(
          ([keyword, pages]: [string, number[]]) => {
            if (pages.length === 0) return null;
            const pagesStr = pages.join(", ");
            return (
              <div
                key={keyword}
                className="flex items-center justify-between text-sm"
              >
                <p className="text-slate-300">
                  '<span className="font-semibold text-sky-400">{keyword}</span>
                  ' found on pages: {pagesStr}
                </p>
                <button
                  onClick={() => handlePrintSpecific(pages)}
                  className="flex items-center text-xs px-2 py-1 bg-slate-600/50 text-slate-300 rounded hover:bg-slate-600 transition-colors"
                >
                  <PrinterIcon className="w-4 h-4 mr-1" /> Print Pages
                </button>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
};

const PdfKeywordSearchComponent: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [searchTerms, setSearchTerms] = useState("");
  const [results, setResults] = useState<KeywordSearchResults>({});
  const [isSearching, setIsSearching] = useState(false);
  const [statusText, setStatusText] = useState(
    "Upload PDFs and enter search terms to begin.",
  );

  // AI Chat Bot state
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatResults, setChatResults] = useState<QaResult[]>([]);
  const [isChatting, setIsChatting] = useState(false);

  const stopSignal = useRef(false);

  const handleFilesSelected = (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setResults({});
    setChatResults([]);
    setStatusText(`Loaded ${selectedFiles.length} PDF(s).`);
  };

  const clearAll = () => {
    setFiles([]);
    setSearchTerms("");
    setResults({});
    setChatQuestion("");
    setChatResults([]);
    setIsSearching(false);
    setIsChatting(false);
    stopSignal.current = false;
    setStatusText("Upload PDFs and enter search terms to begin.");
  };

  const handleStop = () => {
    stopSignal.current = true;
    setStatusText("Stopping process... please wait.");
  };

  const handleChat = async () => {
    if (files.length === 0 || !chatQuestion.trim()) {
      setStatusText("Please select files and ask a question.");
      return;
    }
    setIsChatting(true);
    setChatResults([]);
    stopSignal.current = false;
    setStatusText(`Analyzing ${files.length} file(s) with Gemini...`);

    const allResults: QaResult[] = [];

    for (let i = 0; i < files.length; i++) {
      if (stopSignal.current) {
        setStatusText("Process stopped by user.");
        break;
      }
      const file = files[i];
      setStatusText(
        `Asking Gemini about file ${i + 1} of ${files.length}: ${file.name}...`,
      );

      try {
        const pagesText = await extractTextFromPdfWithPageNumbers(file);
        if (stopSignal.current) break;
        if (pagesText.length === 0) {
          throw new Error("Could not extract any text from the PDF.");
        }
        const { answer, pages } = await getAnswerFromText(
          pagesText,
          chatQuestion,
        );
        if (stopSignal.current) break;

        allResults.push({
          fileName: file.name,
          file,
          question: chatQuestion,
          answer,
          pages,
        });
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
        allResults.push({
          fileName: file.name,
          file,
          question: chatQuestion,
          answer: `Error processing this file: ${error instanceof Error ? error.message : "Unknown error"}`,
          pages: [],
        });
      }

      setChatResults([...allResults]);

      // Add a delay between API calls to avoid rate-limiting
      if (i < files.length - 1 && !stopSignal.current) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    setIsChatting(false);
    if (!stopSignal.current) {
      setStatusText(`Analysis complete for ${allResults.length} file(s).`);
    }
  };

  const handleSearch = async () => {
    const keywords = searchTerms
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (files.length === 0 || keywords.length === 0) {
      setStatusText("Please select files and enter search terms.");
      return;
    }
    setIsSearching(true);
    setResults({});
    stopSignal.current = false;
    setStatusText(
      `Searching for ${keywords.length} term(s) in ${files.length} file(s)...`,
    );

    const allResults: KeywordSearchResults = {};

    // Execute searches in parallel
    await Promise.all(
      files.map(async (file) => {
        if (stopSignal.current) return;
        try {
          const searchResult = await searchKeywordsInPdf(file, keywords);
          if (stopSignal.current) return;
          const hasMatches = Object.values(searchResult).some(
            (pages) => pages.length > 0,
          );
          if (hasMatches) {
            allResults[file.name] = { file, searchResult };
          }
        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error);
        }
      }),
    );

    setResults(allResults);
    setIsSearching(false);
    if (!stopSignal.current) {
      const foundFilesCount = Object.keys(allResults).length;
      setStatusText(
        `Search complete. Found results in ${foundFilesCount} of ${files.length} file(s).`,
      );
    } else {
      setStatusText("Search stopped by user.");
    }
  };

  const downloadPages = async (
    downloadJobs: { file: File; pages: number[]; fileName: string }[],
  ) => {
    if (downloadJobs.length === 0) return;

    const zip = new JSZip();

    for (const job of downloadJobs) {
      const arrayBuffer = await job.file.arrayBuffer();
      const pdfDoc = await pdfLib.PDFDocument.load(arrayBuffer);
      const newPdf = await pdfLib.PDFDocument.create();

      // PDFDoc is 0-indexed internally, while job.pages are 1-indexed
      const validPageIndices = job.pages
          .filter((p) => p > 0 && p <= pdfDoc.getPageCount())
          .map((p) => p - 1);

      if (validPageIndices.length > 0) {
        const copiedPages = await newPdf.copyPages(pdfDoc, validPageIndices);
        copiedPages.forEach((p) => newPdf.addPage(p));

        const pdfBytes = await newPdf.save();
        zip.file(job.fileName, pdfBytes);
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    await downloadBlob(content, "extracted_pdf_pages.zip");
  };

  const handleGlobalDownloadSpecific = () => {
    const jobs: { file: File; pages: number[]; fileName: string }[] = [];
    Object.values(results).forEach(
      ({
        file,
        searchResult,
      }: {
        file: File;
        searchResult: KeywordSearchResult;
      }) => {
        const allPages = new Set<number>();
        Object.values(searchResult).forEach((pages: number[]) =>
          pages.forEach((p) => allPages.add(p)),
        );
        if (allPages.size > 0) {
          jobs.push({
            file,
            pages: Array.from(allPages).sort((a, b) => a - b),
            fileName: file.name,
          });
        }
      },
    );
    downloadPages(jobs);
  };

  const handleGlobalDownloadRange = () => {
    const jobs: { file: File; pages: number[]; fileName: string }[] = [];
    Object.values(results).forEach(
      ({
        file,
        searchResult,
      }: {
        file: File;
        searchResult: KeywordSearchResult;
      }) => {
        const allPages = new Set<number>();
        Object.values(searchResult).forEach((pages: number[]) =>
          pages.forEach((p) => allPages.add(p)),
        );
        if (allPages.size > 0) {
          const maxPage = Math.max(...allPages);
          jobs.push({
            file,
            pages: Array.from({ length: maxPage }, (_, i) => i + 1),
            fileName: file.name,
          });
        }
      },
    );
    downloadPages(jobs);
  };

  const hasResults = Object.keys(results).length > 0;

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
            2. Enter Keywords
          </h2>
          <textarea
            value={searchTerms}
            onChange={(e) => setSearchTerms(e.target.value)}
            disabled={isSearching}
            rows={4}
            className="w-full bg-dark-300 border-dark-300/50 rounded-md shadow-sm p-2 text-slate-200 focus:ring-sky-500 focus:border-sky-500"
            placeholder="Enter keywords, separated by commas..."
          />
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            3. Execute Search
          </h2>
          <div className="space-y-4">
            {isSearching || isChatting ? (
              <button
                onClick={handleStop}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 text-white bg-red-600 hover:bg-red-700 focus:ring-red-500"
              >
                <XCircleIcon className="-ml-1 mr-2 h-5 w-5" />
                Stop Process
              </button>
            ) : (
              <button
                onClick={handleSearch}
                disabled={files.length === 0 || !searchTerms.trim()}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-white bg-sky-600 hover:bg-sky-700 focus:ring-sky-500"
              >
                <MagnifyingGlassIcon className="-ml-1 mr-2 h-5 w-5" />
                Search Keywords
              </button>
            )}
          </div>
        </div>
        <div className="bg-dark-200 p-6 rounded-lg border border-dark-300">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">
            4. AI Chat Bot
          </h2>
          <div className="space-y-4">
            <textarea
              value={chatQuestion}
              onChange={(e) => setChatQuestion(e.target.value)}
              disabled={isChatting || isSearching}
              rows={3}
              className="w-full bg-dark-300 border-dark-300/50 rounded-md shadow-sm p-2 text-slate-200 focus:ring-sky-500 focus:border-sky-500"
              placeholder="Ask a question about the PDFs..."
            />
            {isSearching || isChatting ? (
              <button
                onClick={handleStop}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 text-white bg-red-600 hover:bg-red-700 focus:ring-red-500"
              >
                <XCircleIcon className="-ml-1 mr-2 h-5 w-5" />
                Stop Process
              </button>
            ) : (
              <button
                onClick={handleChat}
                disabled={files.length === 0 || !chatQuestion.trim()}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-white bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
              >
                <SparklesIcon className="-ml-1 mr-2 h-5 w-5" />
                Ask Gemini
              </button>
            )}
            <button
              onClick={clearAll}
              disabled={isSearching || isChatting}
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
          {hasResults && (
            <div className="p-4 border-b border-dark-300 flex items-center space-x-4">
              <h4 className="text-sm font-semibold text-slate-300">
                Global Download Actions:
              </h4>
              <button
                onClick={handleGlobalDownloadSpecific}
                className="flex items-center text-xs px-3 py-1.5 bg-green-900/70 text-green-300 rounded hover:bg-green-900 transition-colors"
              >
                <PrinterIcon className="w-4 h-4 mr-1.5" /> Download All Specific
                Pages
              </button>
              <button
                onClick={handleGlobalDownloadRange}
                className="flex items-center text-xs px-3 py-1.5 bg-blue-900/70 text-blue-300 rounded hover:bg-blue-900 transition-colors"
              >
                <PrinterIcon className="w-4 h-4 mr-1.5" /> Download All Founded
                Ranges
              </button>
            </div>
          )}
          <div className="flex-grow overflow-y-auto p-4 space-y-6">
            {(isSearching || isChatting) &&
              Object.keys(results).length === 0 &&
              chatResults.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  {isSearching
                    ? "Searching through documents..."
                    : "Analyzing documents with AI..."}
                </div>
              )}
            {!isSearching &&
              !isChatting &&
              Object.keys(results).length === 0 &&
              chatResults.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
                  <DocumentMagnifyingGlassIcon className="w-16 h-16 mb-4" />
                  <h3 className="text-xl font-semibold text-slate-400">
                    Ready for your search or chat
                  </h3>
                  <p>Keyword matches and AI answers will appear here.</p>
                </div>
              )}

            {chatResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200 border-b border-dark-300 pb-2 flex items-center">
                  <SparklesIcon className="w-5 h-5 mr-2 text-indigo-400" />
                  AI Chat Answers
                </h3>
                {chatResults.map((result, idx) => (
                  <QaResultCard
                    key={idx}
                    result={result}
                    onPrint={(file, pages, fileName) =>
                      downloadPages([{ file, pages, fileName }])
                    }
                  />
                ))}
              </div>
            )}

            {hasResults && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200 border-b border-dark-300 pb-2 flex items-center">
                  <MagnifyingGlassIcon className="w-5 h-5 mr-2 text-sky-400" />
                  Keyword Matches
                </h3>
                {Object.entries(results).map(
                  ([fileName, data]) => {
                    const typedData = data as { file: File; searchResult: KeywordSearchResult };
                    return (
                      <KeywordResultCard
                        key={fileName}
                        fileName={fileName}
                        file={typedData.file}
                        searchResult={typedData.searchResult}
                        onPrint={(jobs) => {
                          downloadPages(jobs);
                        }}
                      />
                    );
                  },
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfKeywordSearchComponent;
