import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { DocumentIcon, ArrowPathIcon, CloudArrowUpIcon, DocumentChartBarIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import * as pdfjs from 'pdfjs-dist';
import { extractTransactionsFromText } from '../services/merchantGeminiService';
import * as XLSX from 'xlsx';
import { extractTextFromExcel } from '../services/excelService';
import { useAppStore } from '../store/useAppStore';
import type { ExtractedTransaction } from '../types';

import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface ReportItem {
    clinicName: string;
    transactionDate: string;
    accountNumber: string;
    paymentWay: string;
    amount: number;
}

const POSReport: React.FC = () => {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [reportData, setReportData] = useState<ReportItem[]>([]);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    const onDrop = (acceptedFiles: File[]) => {
        setSelectedFiles(prev => [...prev, ...acceptedFiles]);
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'text/csv': ['.csv'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls']
        }
    } as any);

    const extractTextFromFile = async (file: File): Promise<string> => {
        const fileName = file.name.toLowerCase();
        const fileType = file.type;

        if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            
            const pagePromises = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                pagePromises.push(pdf.getPage(i).then(async page => {
                    const textContent = await page.getTextContent();
                    return textContent.items.map((item: any) => 'str' in item ? item.str : '').join(' ');
                }));
            }
            const pages = await Promise.all(pagePromises);
            return pages.join('\n');
        }

        const spreadsheetExtensions = ['.csv', '.xls', '.xlsx'];
        if (spreadsheetExtensions.some(ext => fileName.endsWith(ext))) {
            return extractTextFromExcel(file);
        }
        
        throw new Error(`Unsupported file type: ${file.name}`);
    };

    const processFiles = async () => {
        if (selectedFiles.length === 0) return;
        setIsProcessing(true);
        const allItems: ReportItem[] = [];
        let minDate = Infinity;
        let maxDate = -Infinity;

        try {
            const cfg = useAppStore.getState().getLLMConfig();
            for (const file of selectedFiles) {
                let extracted: any;
                
                if (cfg.provider === 'none') {
                    const { extractWithBackend } = await import('../services/backendService');
                    extracted = await extractWithBackend(file);
                } else {
                    const rawText = await extractTextFromFile(file);
                    extracted = await extractTransactionsFromText(rawText);
                }

                
                if (extracted && extracted.transactions) {
                    extracted.transactions.forEach((t: ExtractedTransaction) => {
                        const date = new Date(t.date);
                        const time = date.getTime();
                        if (!isNaN(time)) {
                            if (time < minDate) minDate = time;
                            if (time > maxDate) maxDate = time;
                        }

                        const desc = t.description.toLowerCase();
                        
                        // User request: ignore transactions with "Fees" or "Trans Type"
                        if (desc.includes('fees') || desc.includes('trans type')) {
                            return;
                        }

                        let paymentWay = 'POS';
                        if (desc.includes('transfer') || desc.includes('ibt') || desc.includes('credit') || desc.includes('withdrawal')) {
                            paymentWay = 'Transfer';
                        }

                        allItems.push({
                            clinicName: extracted.accountName || 'Unknown',
                            transactionDate: t.date,
                            accountNumber: extracted.accountNumber || 'N/A',
                            paymentWay: paymentWay,
                            amount: t.amount
                        });
                    });
                }
            }

            // FIX: parseDD-MM-YYYY dates correctly (new Date() of "13-05-2026" returns NaN).
            // Use the same DD-MM-YYYY reverse-join trick as MerchantEntryAutomation L291.
            const parseTxnDate = (s: string): number => {
                if (!s) return NaN;
                // Try ISO first (YYYY-MM-DD)
                if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
                    const t = new Date(s).getTime();
                    if (!isNaN(t)) return t;
                }
                // Try DD-MM-YYYY
                const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
                if (m) {
                    const [, dd, mm, yyyy] = m;
                    return new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();
                }
                // Fallback: native Date parser
                const t = new Date(s).getTime();
                return isNaN(t) ? 0 : t;
            };
            allItems.sort((a, b) => {
                const clinicCmp = a.clinicName.localeCompare(b.clinicName);
                if (clinicCmp !== 0) return clinicCmp;
                const ta = parseTxnDate(a.transactionDate);
                const tb = parseTxnDate(b.transactionDate);
                return ta - tb;
            });
            
            setReportData(allItems);
            if (minDate !== Infinity) {
                const formatDateStr = (d: number) => {
                    const date = new Date(d);
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    return `${day}-${month}-${year}`;
                };
                setDateRange({
                    start: formatDateStr(minDate),
                    end: formatDateStr(maxDate)
                });
            }
        } catch (error) {
            console.error("Report generation failed:", error);
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadExcel = () => {
        const wb = XLSX.utils.book_new();
        const rows: any[] = [
            [`KNET Collections & Transfer (${dateRange.start} - ${dateRange.end})`],
            ['Clinic Name', 'Transaction Date', 'Account Number', 'Payment way', 'Amount (KWD)']
        ];

        let grandTotal = 0;
        const clinicGroups = reportData.reduce((acc, item) => {
            if (!acc[item.clinicName]) acc[item.clinicName] = [];
            acc[item.clinicName].push(item);
            return acc;
        }, {} as Record<string, ReportItem[]>);

        const paymentWayTotals: Record<string, number> = { 'POS': 0, 'Transfer': 0 };

        (Object.entries(clinicGroups) as [string, ReportItem[]][]).forEach(([clinicName, items]) => {
            let clinicTotal = 0;
            items.forEach(item => {
                const dateParts = item.transactionDate.split('-');
                const formattedDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : item.transactionDate;
                rows.push([clinicName, formattedDate, item.accountNumber, item.paymentWay, item.amount]);
                clinicTotal += item.amount;
                paymentWayTotals[item.paymentWay] = (paymentWayTotals[item.paymentWay] || 0) + item.amount;
            });
            rows.push([`${clinicName} Total`, '', '', '', clinicTotal]);
            grandTotal += clinicTotal;
        });

        rows.push(['Grand Total', '', '', '', grandTotal]);
        rows.push([]);
        rows.push(['Payment way', 'Sum of Amount (KWD)']);
        rows.push(['POS', paymentWayTotals['POS'] || 0]);
        rows.push(['Transfer', paymentWayTotals['Transfer'] || 0]);
        rows.push(['Grand Total', grandTotal]);

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];

        XLSX.utils.book_append_sheet(wb, ws, "Report");
        XLSX.writeFile(wb, `POS_Report_${dateRange.start.replace(/\//g, '-')}.xlsx`);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center space-x-3 mb-2">
                <DocumentChartBarIcon className="w-8 h-8 text-sky-400" />
                <h2 className="text-2xl font-bold text-slate-100">POS Report Generation</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-dark-200 border border-dark-300 rounded-xl p-6 shadow-xl">
                    <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center">
                        <CloudArrowUpIcon className="w-5 h-5 mr-2 text-sky-400" />
                        1. Upload Bank Statements
                    </h3>
                    
                    <div 
                        {...getRootProps()} 
                        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                            isDragActive ? 'border-sky-500 bg-sky-500/10' : 'border-dark-400 hover:border-sky-400/50 hover:bg-dark-300'
                        }`}
                    >
                        <input {...getInputProps()} />
                        <DocumentIcon className="w-12 h-12 mx-auto mb-4 text-slate-500" />
                        <p className="text-slate-300 font-medium">
                            {isDragActive ? 'Drop files here' : 'Upload files or drag and drop'}
                        </p>
                        <p className="text-slate-500 text-sm mt-1">PDF or CSV files</p>
                    </div>

                    {selectedFiles.length > 0 && (
                        <div className="mt-6 space-y-2">
                            <div className="flex justify-between items-center text-sm font-medium text-slate-400 mb-2">
                                <span>Selected files ({selectedFiles.length})</span>
                                <button onClick={() => setSelectedFiles([])} className="text-sky-400 hover:text-sky-300">Clear all</button>
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                                {selectedFiles.map((file, idx) => (
                                    <div key={idx} className="flex items-center p-2 bg-dark-300 rounded-lg text-sm text-slate-300 border border-dark-400">
                                        <DocumentIcon className="w-4 h-4 mr-2 text-sky-400" />
                                        <span className="truncate flex-1">{file.name}</span>
                                    </div>
                                ))}
                            </div>
                            <button 
                                onClick={processFiles}
                                disabled={isProcessing || selectedFiles.length === 0}
                                className="w-full mt-4 flex items-center justify-center px-4 py-3 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-sky-900/20"
                            >
                                {isProcessing ? (
                                    <>
                                        <ArrowPathIcon className="w-5 h-5 mr-2 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <DocumentChartBarIcon className="w-5 h-5 mr-2" />
                                        Generate Report Data
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>

                <div className="bg-dark-200 border border-dark-300 rounded-xl p-6 shadow-xl relative overflow-hidden">
                    <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center">
                        <ArrowDownTrayIcon className="w-5 h-5 mr-2 text-sky-400" />
                        2. Preview & Download
                    </h3>

                    {reportData.length > 0 ? (
                        <div className="space-y-4 h-full flex flex-col">
                           <div className="p-4 bg-dark-300 rounded-lg border border-dark-400">
                                <div className="text-sky-400 font-bold text-sm uppercase tracking-wider mb-1">Date Range Detected</div>
                                <div className="text-slate-100 text-lg font-semibold">{dateRange.start} — {dateRange.end}</div>
                           </div>
                           
                           <div className="flex-1 min-h-[200px] bg-dark-300 rounded-lg border border-dark-400 p-4 overflow-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="text-slate-400 border-b border-dark-400 uppercase tracking-wider font-bold">
                                        <tr>
                                            <th className="pb-2">Clinic</th>
                                            <th className="pb-2">Date</th>
                                            <th className="pb-2">Type</th>
                                            <th className="pb-2 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-300">
                                        {reportData.slice(0, 50).map((item, idx) => (
                                            <tr key={idx} className="border-b border-dark-400/30">
                                                <td className="py-2 pr-2">{item.clinicName}</td>
                                                <td className="py-2 pr-2">
                                                    {(() => {
                                                        const parts = item.transactionDate.split('-');
                                                        return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : item.transactionDate;
                                                    })()}
                                                </td>
                                                <td className="py-2">{item.paymentWay}</td>
                                                <td className="py-2 text-right font-mono text-sky-400">{item.amount.toFixed(3)}</td>
                                            </tr>
                                        ))}
                                        {reportData.length > 50 && (
                                            <tr>
                                                <td colSpan={4} className="py-2 text-center text-slate-500 italic">... and {reportData.length - 50} more items</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                           </div>

                           <button 
                                onClick={downloadExcel}
                                className="w-full flex items-center justify-center px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-emerald-900/20"
                           >
                                <ArrowDownTrayIcon className="w-5 h-5 mr-2" />
                                Download Excel Report
                           </button>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                            <div className="w-16 h-16 bg-dark-300 rounded-full flex items-center justify-center">
                                <DocumentChartBarIcon className="w-8 h-8 text-slate-600" />
                            </div>
                            <div>
                                <p className="text-slate-400 font-medium">No report data generated yet</p>
                                <p className="text-slate-500 text-sm">Upload and process statements to see a preview here.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default POSReport;
