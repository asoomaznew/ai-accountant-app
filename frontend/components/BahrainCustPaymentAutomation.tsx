import React, { useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { processBahrainFiles, ProcessingResult } from '../services/bahrainCustPaymentService';
import * as XLSX from 'xlsx';

export default function BahrainCustPaymentAutomation() {
  const [emailPdfs, setEmailPdfs] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleEmailPdfsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setEmailPdfs(Array.from(e.target.files));
    }
  };

  const handleProcess = async () => {
    if (emailPdfs.length === 0) {
      setError("Please upload at least one email PDF.");
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setResults([]);
    
    try {
      const output = await processBahrainFiles(emailPdfs, setStatus);
      setResults(output);
      
      if (output.length > 0) {
        generateExcel(output);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during processing.");
    } finally {
      setIsProcessing(false);
      setStatus('');
    }
  };

  const generateExcel = (resultsData: ProcessingResult[]) => {
    try {
      const exportData: any[] = [];
      let jnum = 1;
      
      for (const res of resultsData) {
        if (!res.success || !res.extractedData) continue;
        
        let lnum = 1;
        for (const row of res.extractedData.rows) {
          exportData.push({
            "Column1": jnum.toString(),
            "Column2": "Cus_Rec",
            "Column3": lnum.toString(),
            "Column4": row.pdate,
            "Column5": "1",
            "Column6": row.ccode,
            "Column7": `${row.cname}-${row.force}: ${row.desc}`,
            "Column8": "",
            "Column9": row.amt,
            "Column10": "BHD",
            "Column11": 100,
            "Column12": 6,
            "Column13": "AUBBHD001",
            "Column14": "",
            "Column15": "",
            "Column16": row.pdate,
            "Column17": row.pdate,
            "Column18": "",
            "Column19": row.unit === "BHW1-C-10" ? "AdvRent" : (row.force === "EWA" ? "EWA" : "Cust Post"),
            "Column20": "",
            "Column21": "",
            "Column22": lnum.toString(),
            "Column23": "",
            "Column24": "06",
            "Column25": "113",
            "Column26": "107",
            "Column27": "BHW1",
            "Column28": row.unit
          });
          lnum++;
        }
        jnum++;
      }
      
      const ws = XLSX.utils.json_to_sheet(exportData, { skipHeader: true });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Export");
      
      XLSX.writeFile(wb, "Bahrain_CustPayment_Export.xlsx");
    } catch (err) {
      console.error("Excel generation error:", err);
      setError("Failed to generate Excel file.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <FileText className="w-6 h-6 text-sky-400" />
            Bahrain CustPayment
          </h2>
          <p className="text-slate-400 mt-1">Upload email PDFs to extract payment info and generate Excel entry</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-dark-200 p-6 rounded-xl border border-dark-300">
          <label className="block text-sm font-medium text-slate-300 mb-2">Upload Email PDFs</label>
          <div className="relative group">
            <div className="absolute inset-0 bg-sky-500/10 border-2 border-dashed border-sky-500/30 rounded-lg group-hover:bg-sky-500/20 transition-colors" />
            <input
              type="file"
              multiple
              accept="application/pdf"
              onChange={handleEmailPdfsChange}
              className="relative w-full h-32 opacity-0 cursor-pointer z-10"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <Upload className="w-8 h-8 text-sky-400 mb-2" />
              <span className="text-sm font-medium text-slate-300">
                {emailPdfs.length > 0 ? `${emailPdfs.length} files selected` : "Select PDFs"}
              </span>
            </div>
          </div>
          
          <button
            onClick={handleProcess}
            disabled={isProcessing || emailPdfs.length === 0}
            className="mt-6 w-full py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex justify-center items-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {status || "Processing..."}
              </>
            ) : (
              "Process & Generate Excel"
            )}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="bg-dark-200 p-6 rounded-xl border border-dark-300">
          <h3 className="text-lg font-medium text-slate-200 mb-4">Results</h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {results.length === 0 && !isProcessing && (
              <p className="text-slate-500 text-sm italic">No results yet. Upload and process files.</p>
            )}
            {results.map((res, i) => (
              <div key={i} className="p-3 bg-dark-300 rounded border border-dark-400 flex items-center justify-between">
                <span className="text-sm text-slate-300 truncate pr-4">{res.fileName}</span>
                {res.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" title={res.error} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
