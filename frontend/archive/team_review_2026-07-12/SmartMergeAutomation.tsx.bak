import React, { useState } from 'react';
import { processFiles, ProcessingResult } from '../services/smartMergeService';
import { CheckCircle2, FileArchive, Printer, Upload, FileText } from 'lucide-react';
import JSZip from 'jszip';

export default function SmartMergeAutomation() {
  const [mainPdf, setMainPdf] = useState<File | null>(null);
  const [bankStatements, setBankStatements] = useState<File[]>([]);
  const [csvFiles, setCsvFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleToggleSelection = (idx: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) newSet.delete(idx);
      else newSet.add(idx);
      return newSet;
    });
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
      const processedResults = await processFiles(mainPdf, bankStatements, csvFiles, (msg) => {
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
                  ? `Processed ${results.length} batches. ${results.filter(r => r.matched).length} bank matches, ${results.filter(r => r.matchedCsvRows > 0).length} CSV links.`
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
                  return (
                    <div 
                      key={idx} 
                      onClick={() => handleToggleSelection(idx)}
                      className={`
                        grid grid-cols-[40px_1.5fr_1fr_120px] items-center p-3 px-4 transition-colors text-[12px] cursor-pointer
                        ${isSelected ? 'bg-emerald-500/5' : 'hover:bg-dark-300'}
                      `}
                    >
                      <div className="flex justify-center">
                        <div className={`
                          w-4 h-4 rounded border flex items-center justify-center transition-colors
                          ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'}
                        `}>
                          {isSelected && <CheckCircle2 className="w-3 h-3 text-dark-100" />}
                        </div>
                      </div>
                      <div className={`font-medium truncate pr-4 ${isSelected ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {res.fileName}
                      </div>
                      <div className="text-slate-400 truncate pr-4 flex items-center gap-2">
                         {res.fileName.split('_')[0].split('.')[0]}
                         {res.matchedCsvRows > 0 && (
                           <span className="bg-amber-500/10 text-amber-500 text-[9px] px-1.5 py-0.5 rounded border border-amber-500/20">
                             CSV: {res.matchedCsvRows}
                           </span>
                         )}
                      </div>
                      <div className="flex justify-end">
                        <span 
                          className={`
                            text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider
                            ${res.matched || res.matchedCsvRows > 0 ? 'bg-sky-500/15 text-sky-400' : 'bg-slate-500/15 text-slate-400'}
                          `}>
                          {res.matched && res.matchedCsvRows > 0 ? 'Merged (B+C)' : 
                           res.matched ? 'Bank' : 
                           res.matchedCsvRows > 0 ? 'CSV' : 'Split'}
                        </span>
                      </div>
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
