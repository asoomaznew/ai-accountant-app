// Added React import to resolve 'Cannot find namespace React' errors and fixed FileList to Array conversion typing.
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { JournalEntry } from '../types';
import { generateJournalEntries, convertToXLSX } from '../services/warbaJournalService';
import { downloadBlob } from '../utils/downloadHelper';
import { SpinnerIcon, ProcessIcon, DownloadIcon, XIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from './icons';
import { OUTPUT_HEADER } from '../constants';
import * as pdfjs from 'pdfjs-dist';
import JSZip from 'jszip';
import JournalEntryTable from './JournalEntryTable';
import { extractTextFromExcel } from '../services/excelService';
import PQueue from 'p-queue';

import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
import { useAppStore } from '../store/useAppStore';

type FileStatus = 'pending' | 'processing' | 'done' | 'error';

const Header: React.FC = () => (
    <div className="mb-6">
        <div className="flex items-center">
            <ProcessIcon className="w-8 h-8 text-sky-400 mr-3" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-slate-200">Warba Polyclinics Journal Entry Automation</h1>
        </div>
         <p className="text-sm text-slate-400 mt-2 sm:mt-0 ml-11">Prepared by Haitham Soliman Abdou</p>
    </div>
);

const StatusBadge: React.FC<{ status: FileStatus }> = ({ status }) => {
    switch (status) {
        case 'done':
            return (
                <div className="flex items-center text-green-400 px-2 py-0.5 rounded border border-green-400/30 bg-green-400/10 text-[10px] font-bold uppercase tracking-wider">
                    <CheckCircleIcon className="w-3 h-3 mr-1" /> Done
                </div>
            );
        case 'error':
            return (
                <div className="flex items-center text-red-400 px-2 py-0.5 rounded border border-red-400/30 bg-red-400/10 text-[10px] font-bold uppercase tracking-wider">
                    <XCircleIcon className="w-3 h-3 mr-1" /> Error
                </div>
            );
        case 'processing':
            return (
                <div className="flex items-center text-sky-400 px-2 py-0.5 rounded border border-sky-400/30 bg-sky-400/10 text-[10px] font-bold uppercase tracking-wider">
                    <SpinnerIcon className="w-3 h-3 mr-1 animate-spin" /> Working
                </div>
            );
        case 'pending':
        default:
            return (
                <div className="flex items-center text-slate-500 px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-[10px] font-bold uppercase tracking-wider">
                    <ClockIcon className="w-3 h-3 mr-1" /> Pending
                </div>
            );
    }
};

const FileListItem: React.FC<{ file: File; status: FileStatus; onRemove: (name: string) => void }> = ({ file, status, onRemove }) => (
    <div className="flex items-center justify-between bg-dark-300 p-2 rounded-md text-sm animate-fade-in group">
        <div className="flex items-center space-x-3 truncate">
            <StatusBadge status={status} />
            <span className="text-slate-300 truncate pr-2">{file.name}</span>
        </div>
        <button onClick={() => onRemove(file.name)} className="text-slate-500 hover:text-red-400 p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors">
            <XIcon className="w-4 h-4" />
        </button>
    </div>
);


const WarbaEntryAutomation: React.FC = () => {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [fileStatuses, setFileStatuses] = useState<{ [fileName: string]: FileStatus }>({});
    const [journalEntriesByFile, setJournalEntriesByFile] = useState<{ [fileName: string]: JournalEntry[] }>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [errors, setErrors] = useState<{ [fileName: string]: string }>({});
    const [searchTerm, setSearchTerm] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const extractTextFromFile = async (file: File): Promise<string> => {
        const fileName = file.name.toLowerCase();
        const fileType = file.type;

        if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            
            // Parallel extraction of pages
            const pagePromises = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                pagePromises.push(pdf.getPage(i).then(async page => {
                    const textContent = await page.getTextContent();
                    return textContent.items.map(item => 'str' in item ? item.str : '').join(' ');
                }));
            }
            const pages = await Promise.all(pagePromises);
            return pages.join('\n');
        }

        const spreadsheetMimeTypes = [
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];
        const spreadsheetExtensions = ['.csv', '.xls', '.xlsx'];

        if (spreadsheetMimeTypes.includes(fileType) || spreadsheetExtensions.some(ext => fileName.endsWith(ext))) {
            return extractTextFromExcel(file);
        }
        
        throw new Error(`Unsupported file type: ${file.name}. Only PDF and CSV files are supported.`);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            // Explicitly cast to File[] to help TypeScript with type inference from FileList.
            const fileList = Array.from(files) as File[];
            setSelectedFiles(fileList);
            const initialStatuses: { [key: string]: FileStatus } = {};
            fileList.forEach(f => initialStatuses[f.name] = 'pending');
            setErrors({});
            setJournalEntriesByFile({});
        }
    };
    
    const handleRemoveFile = (fileNameToRemove: string) => {
        setSelectedFiles(prevFiles => prevFiles.filter(file => file.name !== fileNameToRemove));
        setFileStatuses(prev => {
            const newState = { ...prev };
            delete newState[fileNameToRemove];
            return newState;
        });
    };
    
    const resetState = () => {
        setSelectedFiles([]);
        setFileStatuses({});
        setErrors({});
        setJournalEntriesByFile({});
        setSearchTerm('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleProcess = useCallback(async () => {
        if (selectedFiles.length === 0) {
            setErrors({ general: "Please upload at least one PDF or CSV file." });
            return;
        }
        setIsLoading(true);
        setErrors({});
        setJournalEntriesByFile({});
        setSearchTerm('');

        const queue = new PQueue({ concurrency: 1 });

        const resultsMap: { [fileName: string]: JournalEntry[] } = {};
        const offsetAccounts = useAppStore.getState().warbaVendorOffsetAccounts;

        const tasks = selectedFiles.map(file => async () => {
            setFileStatuses(prev => ({ ...prev, [file.name]: 'processing' }));
            try {
                const formData = new FormData();
                formData.append("files", file);

                const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
                const response = await fetch(`${backendUrl}/api/process-statements`, {
                    method: "POST",
                    headers: {
                        'Authorization': `Bearer ${import.meta.env.VITE_BACKEND_TOKEN ?? (import.meta.env.DEV ? 'local_bypass_token' : '')}`,
                    },
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error(`Server responded with status: ${response.status}`);
                }

                const data = await response.json();
                const fileResult = data[file.name];
                
                if (fileResult && fileResult.error) {
                    throw new Error(fileResult.error);
                }

                const journalEntries = fileResult || [];
                
                resultsMap[file.name] = journalEntries;
                setJournalEntriesByFile(prev => ({
                    ...prev,
                    [file.name]: journalEntries
                }));
                setFileStatuses(prev => ({ ...prev, [file.name]: 'done' }));
            } catch (err: any) {
                 setErrors(prev => ({
                    ...prev,
                    [file.name]: err.message || "An unknown error occurred."
                 }));
                 setFileStatuses(prev => ({ ...prev, [file.name]: 'error' }));
            }
        });

        await queue.addAll(tasks);

        // Consolidate and set in global Zustand store for AI Copilot
        const allEntries = Object.values(resultsMap).flat();
        useAppStore.getState().setCurrentJournalEntries(allEntries);

        setIsLoading(false);
    }, [selectedFiles]);


    const handleDownload = useCallback(async () => {
        if (Object.keys(journalEntriesByFile).length === 0) return;

        const zip = new JSZip();
        const selectedFileNames = new Set(selectedFiles.map(f => f.name));

        const filesToIncludeInZip = Object.keys(journalEntriesByFile).filter(fileName => 
            selectedFileNames.has(fileName) && journalEntriesByFile[fileName]?.length > 0
        );
        
        if (filesToIncludeInZip.length === 0) {
            setErrors({ general: "No journal entries from the selected files are available to download." });
            return;
        }
        
        for (const fileName of filesToIncludeInZip) {
            const xlsxContent = await convertToXLSX(journalEntriesByFile[fileName]);
            const newFileName = fileName.replace(/\.(pdf|csv)$/i, '.xlsx');
            zip.file(newFileName, xlsxContent);
        }
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const downloadFileName = filesToIncludeInZip.length === 1 
            ? filesToIncludeInZip[0].replace(/\.(pdf|csv)$/i, '.zip') 
            : "JournalEntries.zip";
        await downloadBlob(zipBlob, downloadFileName);
    }, [journalEntriesByFile, selectedFiles]);

    const handleDownloadSingleSheet = useCallback(async () => {
        if (Object.keys(journalEntriesByFile).length === 0) return;
    
        const filesToProcess = Object.keys(journalEntriesByFile)
            .filter(fileName => journalEntriesByFile[fileName]?.length > 0)
            .sort();

        if (filesToProcess.length === 0) {
            setErrors({ general: "No journal entries from the selected files are available to download." });
            return;
        }
    
        const consolidatedEntries: JournalEntry[] = [];
        let journalNumberBase = 0;

        for (const fileName of filesToProcess) {
            const entriesForFile = journalEntriesByFile[fileName];
            if (!entriesForFile || entriesForFile.length === 0) continue;

            const creditJournalNumber = journalNumberBase + 1;
            const debitJournalNumber = journalNumberBase + 2;

            const modifiedEntries = entriesForFile.map(entry => {
                const newEntry = { ...entry };
                if (entry.journalName === 'CRNOTE') {
                    newEntry.journalNumber = creditJournalNumber;
                } else if (entry.journalName === 'STVINV') {
                    newEntry.journalNumber = debitJournalNumber;
                } else {
                    newEntry.journalNumber = newEntry.journalNumber || creditJournalNumber;
                }
                return newEntry;
            });
            
            consolidatedEntries.push(...modifiedEntries);
            journalNumberBase += 2;
        }

        consolidatedEntries.sort((a, b) => {
            const numA = Number(a.journalNumber) || 0;
            const numB = Number(b.journalNumber) || 0;
            if (numA !== numB) {
                return numA - numB;
            }
            const dateA = new Date(a.postingDate.split('-').reverse().join('-')).getTime();
            const dateB = new Date(b.postingDate.split('-').reverse().join('-')).getTime();
            if (isNaN(dateA) || isNaN(dateB)) return 0;
            return dateA - dateB;
        });

        let lineNumCounter = 0;
        let lastJournalNum = -1;
        const seenInvoices = new Set<string>();

        const finalEntries = consolidatedEntries.map(entry => {
            if (entry.journalNumber !== lastJournalNum) {
                lastJournalNum = entry.journalNumber;
                lineNumCounter = 1;
            } else {
                lineNumCounter++;
            }

            let invoiceNo = entry.invoiceNo || "";
            if (seenInvoices.has(invoiceNo)) {
                let suffix = 1;
                let newInvoiceNo = invoiceNo;
                while (seenInvoices.has(newInvoiceNo)) {
                    const base = invoiceNo.length > 17 ? invoiceNo.substring(0, 17) : invoiceNo;
                    newInvoiceNo = `${base}-${suffix}`.substring(0, 20);
                    suffix++;
                }
                invoiceNo = newInvoiceNo;
            }
            seenInvoices.add(invoiceNo);

            return {
                ...entry,
                lineNum: lineNumCounter,
                numberOfVoucher: lineNumCounter,
                invoiceNo: invoiceNo,
            };
        });
    
        if (finalEntries.length === 0) {
            setErrors({ general: "No journal entries were generated to download." });
            return;
        }
    
        try {
            const xlsxContent = await convertToXLSX(finalEntries);
            const blob = new Blob([xlsxContent], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            
            const downloadFileName = filesToProcess.length === 1
                ? "Warba " + filesToProcess[0].replace(/\.(pdf|csv|xlsx)$/i, '.xlsx')
                : "Warba Consolidated_Journal_Entries.xlsx";
            
            await downloadBlob(blob, downloadFileName);
        } catch (err: any) {
            setErrors({ general: err.message || "An error occurred while creating the consolidated Excel file." });
        }
    }, [journalEntriesByFile, selectedFiles]);

    const hasErrors = Object.keys(errors).length > 0;
    const hasJournalEntries = Object.keys(journalEntriesByFile).length > 0 && Object.values(journalEntriesByFile).flat().length > 0;
    const successfulFilesCount = Object.keys(journalEntriesByFile).filter(key => journalEntriesByFile[key].length > 0).length;

    const filteredEntries = useMemo(() => {
        const allEntries = Object.values(journalEntriesByFile).flat();
        if (!searchTerm.trim()) {
            return allEntries;
        }
        const lowercasedTerm = searchTerm.toLowerCase();
        return allEntries.filter(entry => 
            Object.values(entry).some(value => 
                String(value).toLowerCase().includes(lowercasedTerm)
            )
        );
    }, [journalEntriesByFile, searchTerm]);

    const handleEntryEdit = useCallback((index: number, field: keyof JournalEntry, value: string | number) => {
        const targetEntry = filteredEntries[index];
        if (!targetEntry) return;

        setJournalEntriesByFile(prev => {
            const newState = { ...prev };
            for (const [fileName, entries] of Object.entries(newState)) {
                const entryIndex = entries.findIndex(e => e === targetEntry);
                if (entryIndex !== -1) {
                    newState[fileName] = [...entries];
                    newState[fileName][entryIndex] = { ...targetEntry, [field]: value };
                    
                    // Update global store as well so Copilot sees changes
                    setTimeout(() => {
                        const allEntries = Object.values(newState).flat();
                        useAppStore.getState().setCurrentJournalEntries(allEntries);
                    }, 0);
                    break;
                }
            }
            return newState;
        });
    }, [filteredEntries]);


    const getRightPanelTitle = () => {
        if (hasJournalEntries || hasErrors) return "2. Download Results";
        return "2. Results";
    };
    
    const getRightPanelDescription = () => {
        if (hasJournalEntries) return `Processing complete. Generated journal entries for ${successfulFilesCount} file(s). Choose your download format.`;
        if (hasErrors) return "Processing complete, but some files could not be processed. Please review the errors below.";
        return "After processing, your results will appear here.";
    }

    return (
        <div>
            <Header />
            <div className="grid grid-cols-1 gap-8">
                {/* Input Panel */}
                <div className="bg-dark-200 p-6 rounded-lg shadow-lg">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold mb-3 text-slate-200">1. Upload Bank Statements</h2>
                         {selectedFiles.length > 0 && (
                            <button onClick={resetState} className="text-sm text-sky-400 hover:text-sky-300">Start Over</button>
                        )}
                    </div>
                    <p className="text-sm text-slate-400 mb-4">
                       Select one or more bank statements in PDF or CSV format.
                    </p>
                    
                    <div 
                        className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dark-300 border-dashed rounded-md cursor-pointer hover:border-sky-500 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                        onDrop={(e) => { e.preventDefault(); handleFileChange({ target: { files: e.dataTransfer.files } } as any); }}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        <div className="space-y-1 text-center">
                            <svg className="mx-auto h-12 w-12 text-slate-500" stroke="currentColor" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeWidth="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            <div className="flex text-sm text-slate-500 justify-center">
                                <label htmlFor="file-upload-warba" className="relative cursor-pointer bg-dark-200 rounded-md font-medium text-sky-500 hover:text-sky-400 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-dark-200 focus-within:ring-sky-600">
                                    <span>Upload files</span>
                                    <input id="file-upload-warba" name="file-upload-warba" type="file" className="sr-only" multiple onChange={handleFileChange} ref={fileInputRef} accept=".pdf,.csv,.xlsx,.xls" />
                                </label>
                                <p className="pl-1">or drag and drop</p>
                            </div>
                            <p className="text-xs text-slate-400">PDF or CSV files</p>
                        </div>
                    </div>

                    {selectedFiles.length > 0 && (
                        <div className="mt-4 space-y-2">
                            <h3 className="font-semibold text-slate-300">Selected files:</h3>
                            {selectedFiles.map((file, index) => (
                                <FileListItem 
                                    key={index} 
                                    file={file} 
                                    status={fileStatuses[file.name] || 'pending'} 
                                    onRemove={handleRemoveFile} 
                                />
                            ))}
                        </div>
                    )}

                    <div className="mt-6">
                        <button
                            onClick={handleProcess}
                            disabled={isLoading || selectedFiles.length === 0}
                            className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 focus:ring-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? <SpinnerIcon className="animate-spin -ml-1 mr-3 h-5 w-5" /> : <ProcessIcon className="-ml-1 mr-3 h-5 w-5" />}
                            {isLoading ? 'Processing...' : 'Process & Generate Journals'}
                        </button>
                    </div>
                </div>

                {/* Output Panel */}
                <div className="bg-dark-200 p-6 rounded-lg shadow-lg flex flex-col">
                    <h2 className="text-xl font-semibold mb-1 text-slate-200">{getRightPanelTitle()}</h2>
                    <p className="text-sm text-slate-400 mb-4 h-10">{getRightPanelDescription()}</p>
                    
                    <div className="flex-grow flex flex-col justify-start space-y-4">
                       {hasErrors && Object.entries(errors).map(([fileName, errorMsg]) => (
                            <div key={fileName} className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md animate-fade-in" role="alert">
                                <strong className="font-bold">{fileName === 'general' ? 'Error' : `Error in ${fileName}`}: </strong>
                                <span className="block sm:inline">{errorMsg}</span>
                            </div>
                        ))}
                        
                        {hasJournalEntries && (
                            <div className="space-y-4">
                                 <JournalEntryTable
                                    headers={OUTPUT_HEADER}
                                    entries={filteredEntries}
                                    searchTerm={searchTerm}
                                    onSearchChange={setSearchTerm}
                                    onEntryEdit={handleEntryEdit}
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <button
                                        onClick={handleDownload}
                                        className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 focus:ring-blue-500"
                                    >
                                        <DownloadIcon className="-ml-1 mr-3 h-5 w-5" />
                                        Download All as ZIP
                                    </button>
                                    <button
                                        onClick={handleDownloadSingleSheet}
                                        className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-200 focus:ring-green-500"
                                    >
                                       <DownloadIcon className="-ml-1 mr-3 h-5 w-5" />
                                        Download as One Sheet
                                    </button>
                                </div>
                            </div>
                        )}

                         {(!isLoading && !hasJournalEntries && !hasErrors) && (
                            <div className="text-center text-slate-500 flex-grow flex items-center justify-center">
                                <p>Upload files and click 'Process' to begin.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WarbaEntryAutomation;
