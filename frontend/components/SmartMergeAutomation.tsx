import React, { useState, useEffect, useRef } from 'react';
import { processFiles, ProcessingResult } from '../services/smartMergeService';
import { CheckCircle2, FileArchive, Printer, Upload, FileText, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.5.136/build/pdf.worker.mjs`;

const PreviewPdf = ({ blob }: { blob: Blob }) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [rendering, setRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadPdf = async () => {
      try {
        setError(null);
        const arrBuffer = await blob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrBuffer });
        const pdf = await loadingTask.promise;
        if (isMounted) {
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          setPageNum(1);
        }
      } catch (err) {
        console.error("Error loading PDF:", err);
        if (isMounted) {
          setError("Failed to load PDF preview.");
        }
      }
    };
    loadPdf();
    return () => {
      isMounted = false;
    };
  }, [blob]);

  useEffect(() => {
    if (!pdfDoc) return;
    let renderTask: any = null;
    let isMounted = true;

    const renderPage = async () => {
      try {
        setRendering(true);
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        if (!canvas || !isMounted) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
        if (isMounted) {
          setRendering(false);
        }
      } catch (err) {
        console.error("Error rendering PDF page:", err);
        if (isMounted) {
          setRendering(false);
        }
      }
    };

    renderPage();

    return () => {
      isMounted = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNum]);

  if (error) {
    return (
      <div className="flex items-center justify-center p-4 bg-dark-300 border border-red-500/20 text-red-400 rounded-lg text-xs mt-2">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 mt-2 w-full">
      {/* Controls bar */}
      <div className="flex items-center justify-between bg-dark-300 p-2 rounded-lg border border-dark-400 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pageNum <= 1 || rendering}
            onClick={(e) => { e.stopPropagation(); setPageNum(p => Math.max(1, p - 1)); }}
            className="px-2.5 py-1 bg-dark-400 hover:bg-dark-500 text-slate-300 font-medium rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={pageNum >= numPages || rendering}
            onClick={(e) => { e.stopPropagation(); setPageNum(p => Math.min(numPages, p + 1)); }}
            className="px-2.5 py-1 bg-dark-400 hover:bg-dark-500 text-slate-300 font-medium rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
          <span className="text-slate-400 select-none">
            Page <strong className="text-slate-200">{pageNum}</strong> of {numPages}
          </span>
        </div>
        {rendering && (
          <span className="text-amber-400 text-[11px] animate-pulse select-none">Rendering...</span>
        )}
      </div>
      
      {/* Canvas viewport wrapper */}
      <div 
        onClick={(e) => e.stopPropagation()} 
        className="overflow-auto flex justify-center bg-dark-300 p-2 rounded-lg border border-dark-400 max-h-[650px] min-h-[300px]"
      >
        <canvas ref={canvasRef} className="max-w-full shadow-lg rounded" />
      </div>
    </div>
  );
};

export default function SmartMergeAutomation() {
  const [mainPdf, setMainPdf] = useState<File | null>(null);
  const [bankStatements, setBankStatements] = useState<File[]>([]);
  const [csvFiles, setCsvFiles] = useState<File[]>([]);
  const [emailPdfs, setEmailPdfs] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggleSelection = (idx: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) newSet.delete(idx);
      else newSet.add(idx);
      return newSet;
    });
  };

  const handleToggleExpand = (idx: number) => {
    setExpandedId(prev => prev === idx ? null : idx);
  };

  const handleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (results.length === 0) return;
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.keys()));
    }
  };

  const handleMainPdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setMainPdf(e.target.files[0]);
    }
  };

  const handleBankStatementsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setBankStatements(Array.from(e.target.files));
    }
  };

  const handleCsvFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setCsvFiles(Array.from(e.target.files));
    }
  };

  const handleEmailFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setEmailPdfs(Array.from(e.target.files));
    }
  };

  const handleProcess = async () => {
    if (!mainPdf) {
      setError('Please select the Main PDF.');
      return;
    }

    setIsProcessing(true);
    setResults([]);
    setSelectedIds(new Set());
    setError(null);

    try {
      const processedResults = await processFiles(mainPdf, bankStatements, csvFiles, emailPdfs, (msg) => {
        setStatus(msg);
      });
      setResults(processedResults);
      // Auto-select all results after processing
      setSelectedIds(new Set(processedResults.keys()));
      setStatus('Processing complete!');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An error occurred during processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSelected = async () => {
    if (selectedIds.size === 0) return;
    
    const selectedResults = results.filter((_, idx) => selectedIds.has(idx));
    
    if (selectedResults.length === 1) {
      downloadSingle(selectedResults[0]);
      return;
    }

    setStatus("Zipping files for download...");
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (const res of selectedResults) {
        let cleanName = res.fileName.replace(/[\\/:*?"<>|]/g, '_');
        if (!cleanName || cleanName.length < 5) {
          cleanName = `Batch_${Math.random().toString(36).substring(7)}.pdf`;
        }
        
        let finalName = cleanName;
        let counter = 1;
        while (usedNames.has(finalName)) {
          const parts = cleanName.split('.');
          const ext = parts.length > 1 ? parts.pop() : 'pdf';
          const base = parts.join('.');
          finalName = `${base}_${counter}.${ext}`;
          counter++;
        }
        usedNames.add(finalName);

        zip.file(finalName, res.blob);
      }

      const blob = await zip.generateAsync({ 
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      }, (metadata) => {
        if (metadata.percent > 0) {
          setStatus(`Zipping: ${Math.round(metadata.percent)}%`);
        }
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "Matched_Journal_Batches.zip";
      document.body.appendChild(a);
      a.click();
      
      setStatus("Download initiated.");
      
      setTimeout(() => {
        URL.revokeObjectURL(url);
        if (document.body && document.body.contains(a)) document.body.removeChild(a);
      }, 15000);
      
    } catch (err) {
      console.error(err);
      setError("Failed to create zip file for download.");
      setStatus("");
    }
  };

  const printSelected = () => {
    results.forEach((res, idx) => {
      if (selectedIds.has(idx)) {
        const url = URL.createObjectURL(res.blob);
        const win = window.open(url, '_blank');
        if (win) {
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
      }
    });
  };

  const downloadSingle = (res: ProcessingResult) => {
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    document.body.appendChild(a);
    a.href = url;
    a.download = res.fileName;
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      if (document.body.contains(a)) document.body.removeChild(a);
    }, 1000);
  };

  return (
    <div className="flex bg-dark-100 rounded-xl overflow-hidden border border-dark-300 min-h-[600px]">
      {/* Sidebar - Control Panel */}
      <aside className="w-[320px] bg-dark-200 border-r border-dark-300 p-6 flex flex-col overflow-y-auto">
        <div className="mb-8 text-center">
            <h3 className="text-xl font-bold tracking-tight text-sky-400 mb-1 italic">SMART SPLIT</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 opacity-60">PDF Processor v2.0</p>
        </div>

        <div className="space-y-5 flex-1">
          {/* Main Upload */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Primary Source</label>
            <div className={`relative group transition-all rounded-lg border-2 border-dashed p-4 text-center ${mainPdf ? 'bg-sky-500/5 border-sky-500/30' : 'border-dark-300 hover:border-sky-500/50'}`}>
              <input type="file" onChange={handleMainPdfChange} accept=".pdf" className="absolute inset-0 opacity-0 cursor-pointer" />
              <div className="space-y-1.5">
                <Upload className={`w-5 h-5 mx-auto ${mainPdf ? 'text-sky-400' : 'text-slate-400'}`} />
                <p className="text-[12px] font-medium leading-tight text-slate-200 truncate">
                  {mainPdf ? mainPdf.name : 'Target Accounting PDF'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bank Library (Optional)</label>
            <div className={`relative group transition-all rounded-lg border-2 border-dashed p-4 text-center ${bankStatements.length > 0 ? 'bg-emerald-500/5 border-emerald-500/30' : 'border-dark-300 hover:border-emerald-500/50'}`}>
              <input type="file" multiple onChange={handleBankStatementsChange} accept=".pdf" className="absolute inset-0 opacity-0 cursor-pointer" />
              <div className="space-y-1.5">
                <FileArchive className={`w-5 h-5 mx-auto ${bankStatements.length > 0 ? 'text-emerald-400' : 'text-slate-400'}`} />
                <p className="text-[12px] font-medium leading-tight text-slate-200">
                  {bankStatements.length > 0 ? `${bankStatements.length} statements loaded` : 'Bank Statements Folder (Optional)'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Transaction Data (Optional)</label>
            <div className={`relative group transition-all rounded-lg border-2 border-dashed p-4 text-center ${csvFiles.length > 0 ? 'bg-amber-500/5 border-amber-500/30' : 'border-dark-300 hover:border-amber-500/50'}`}>
              <input type="file" multiple onChange={handleCsvFilesChange} accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" />
              <div className="space-y-1.5">
                <FileText className={`w-5 h-5 mx-auto ${csvFiles.length > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
                <p className="text-[12px] font-medium leading-tight text-slate-200">
                  {csvFiles.length > 0 ? `${csvFiles.length} CSV sources` : 'CSV Exports / POS Data'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email PDFs (Optional)</label>
            <div className={`relative group transition-all rounded-lg border-2 border-dashed p-4 text-center ${emailPdfs.length > 0 ? 'bg-sky-500/5 border-sky-500/30' : 'border-dark-300 hover:border-sky-500/50'}`}>
              <input type="file" multiple onChange={handleEmailFilesChange} accept=".pdf" className="absolute inset-0 opacity-0 cursor-pointer" />
              <div className="space-y-1.5">
                <Mail className={`w-5 h-5 mx-auto ${emailPdfs.length > 0 ? 'text-sky-400' : 'text-slate-400'}`} />
                <p className="text-[12px] font-medium leading-tight text-slate-200">
                  {emailPdfs.length > 0 ? `${emailPdfs.length} emails loaded` : 'Email PDFs Folder (Optional)'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] rounded-lg animate-in fade-in slide-in-from-bottom-2">
              {error}
            </div>
          )}
          <button
            onClick={handleProcess}
            disabled={isProcessing || !mainPdf}
            className="w-full py-3 bg-sky-600 text-white rounded-lg font-bold text-[13px] uppercase tracking-widest shadow-lg hover:bg-sky-500 active:translate-y-0.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Processing...' : 'Run Integration'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 flex flex-col min-w-0 bg-dark-100">
        <div className="flex justify-between items-end mb-4 pb-4 border-b border-dark-300">
          <div className="flex items-center gap-4">
            <div>
              <h4 className="text-md font-medium text-slate-100">Generated Batches</h4>
              <p className="text-[11px] text-slate-400 mt-1">
                {results.length > 0 
                  ? `Processed ${results.length} batches. ${results.filter(r => r.matched).length} bank matches, ${results.filter(r => r.matchedCsvRows > 0).length} CSV links, ${results.filter(r => r.matchedEmailsCount && r.matchedEmailsCount > 0).length} Email matches.`
                  : 'Upload files and run process to see results.'}
              </p>
            </div>
            {results.length > 0 && (
              <button 
                onClick={handleSelectAll}
                className="text-[10px] font-bold uppercase text-emerald-400 hover:underline"
              >
                {selectedIds.size === results.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>
          <div className="text-[11px] text-emerald-400 italic font-medium">
            {isProcessing ? status : results.length > 0 ? 'Task Complete.' : ''}
          </div>
        </div>

        <div className="flex-1 bg-dark-200 rounded-xl border border-dark-300 shadow-sm flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {results.length > 0 ? (
              <div className="divide-y divide-dark-300">
                {results.map((res, idx) => {
                  const isSelected = selectedIds.has(idx);
                  const isExpanded = expandedId === idx;
                  return (
                    <div key={idx} className="flex flex-col border-b border-dark-300 last:border-0">
                      <div 
                        onClick={() => handleToggleExpand(idx)}
                        className={`
                          grid grid-cols-[40px_1.5fr_1fr_120px] items-center p-3 px-4 transition-colors text-[12px] cursor-pointer
                          ${isSelected ? 'bg-emerald-500/5' : 'hover:bg-dark-300'}
                        `}
                      >
                        <div className="flex justify-center" onClick={(e) => handleToggleSelection(idx, e)}>
                          <div className={`
                            w-4 h-4 rounded border flex items-center justify-center transition-colors
                            ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'}
                          `}>
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-dark-100" />}
                          </div>
                        </div>
                        <div className={`font-medium truncate pr-4 flex items-center gap-2 ${isSelected ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          {res.fileName}
                        </div>
                        <div className="text-slate-400 truncate pr-4 flex items-center gap-2">
                           {res.fileName.split('_')[0].split('.')[0]}
                           {res.matchedCsvRows > 0 && (
                             <span className="bg-amber-500/10 text-amber-500 text-[9px] px-1.5 py-0.5 rounded border border-amber-500/20">
                               CSV: {res.matchedCsvRows}
                             </span>
                           )}
                           {res.matchedEmailsCount && res.matchedEmailsCount > 0 && (
                             <span className="bg-sky-500/10 text-sky-400 text-[9px] px-1.5 py-0.5 rounded border border-sky-500/20" title={res.matchedEmailNames?.join(', ')}>
                               Email: {res.matchedEmailsCount}
                             </span>
                           )}
                        </div>
                        <div className="flex justify-end">
                          <span 
                            className={`
                              text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider
                              ${res.matched || res.matchedCsvRows > 0 || (res.matchedEmailsCount && res.matchedEmailsCount > 0) ? 'bg-sky-500/15 text-sky-400' : 'bg-slate-500/15 text-slate-400'}
                            `}>
                            {res.matched && res.matchedCsvRows > 0 && res.matchedEmailsCount && res.matchedEmailsCount > 0 ? 'Merged (B+C+E)' :
                             res.matched && res.matchedCsvRows > 0 ? 'Merged (B+C)' :
                             res.matched && res.matchedEmailsCount && res.matchedEmailsCount > 0 ? 'Merged (B+E)' :
                             res.matchedCsvRows > 0 && res.matchedEmailsCount && res.matchedEmailsCount > 0 ? 'Merged (C+E)' :
                             res.matched ? 'Bank' : 
                             res.matchedCsvRows > 0 ? 'CSV' : 
                             res.matchedEmailsCount && res.matchedEmailsCount > 0 ? 'Email' : 'Split'}
                          </span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="p-4 bg-dark-200/50 border-t border-dark-300">
                          <div className="flex justify-between items-center mb-2">
                             <h5 className="text-sm font-semibold text-slate-300">Document Preview</h5>
                             <button onClick={() => downloadSingle(res)} className="text-[11px] text-sky-400 hover:underline">Download PDF</button>
                          </div>
                          <PreviewPdf blob={res.blob} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 p-10 text-center">
                <FileText className="w-10 h-10 mb-4 opacity-10" />
                <p className="text-[13px]">No files processed.</p>
                <p className="text-[11px] opacity-60">Ready for high-speed PDF distribution.</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions Bar */}
        <div className="mt-5 flex gap-3 justify-end items-center">
          {results.length > 0 && (
            <>
              <div className="mr-auto text-[10px] text-slate-400 font-medium">
                {selectedIds.size} of {results.length} items selected
              </div>
              <button
                onClick={downloadSelected}
                disabled={selectedIds.size === 0}
                className="px-4 py-2 bg-amber-600 text-dark-100 rounded-lg text-[12px] font-semibold flex items-center gap-2 hover:bg-amber-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <FileArchive className="w-4 h-4" />
                Download ({selectedIds.size})
              </button>
              <button
                onClick={printSelected}
                disabled={selectedIds.size === 0}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg text-[12px] font-semibold flex items-center gap-2 hover:bg-sky-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Printer className="w-4 h-4" />
                Print ({selectedIds.size})
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
