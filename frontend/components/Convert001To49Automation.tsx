import React, { useState, useCallback, useRef, useMemo } from 'react';
import { ProcessIcon, DownloadIcon, XIcon, CheckCircleIcon, XCircleIcon, ClockIcon, SpinnerIcon } from './icons';
import { extractTextFromExcel, extractCellValue } from '../services/excelService';
import ExcelJS from "exceljs";
import Papa from 'papaparse';
import { downloadBlob } from '../utils/downloadHelper';
import JournalEntryTable from './JournalEntryTable';
import { JournalEntry } from '../types';
import { convert001To49Rows, CONVERT_OUTPUT_HEADERS } from '../services/convert001To49Service';

type FileStatus = 'pending' | 'processing' | 'done' | 'error';

const Header: React.FC = () => (
    <div className="mb-6">
        <div className="flex items-center">
            <ProcessIcon className="w-8 h-8 text-indigo-400 mr-3" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-slate-200">Convert 001 to 49</h1>
        </div>
         <p className="text-sm text-slate-400 mt-2 sm:mt-0 ml-11">Filter by Offset Account 50-000001 and map to 49-000001</p>
    </div>
);

const Convert001To49Automation: React.FC = () => {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [fileStatuses, setFileStatuses] = useState<{ [fileName: string]: FileStatus }>({});
    const [journalEntriesByFile, setJournalEntriesByFile] = useState<{ [fileName: string]: any[] }>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [errors, setErrors] = useState<{ [fileName: string]: string }>({});
    const [searchTerm, setSearchTerm] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const fileList = Array.from(files) as File[];
            setSelectedFiles(fileList);
            const initialStatuses: { [key: string]: FileStatus } = {};
            fileList.forEach(f => initialStatuses[f.name] = 'pending');
            setFileStatuses(initialStatuses);
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



    const processExcelFile = async (file: File) => {
        try {
            if (file.name.toLowerCase().endsWith('.csv')) {
                return new Promise<any[]>((resolve, reject) => {
                    Papa.parse(file, {
                        header: true,
                        skipEmptyLines: true,
                        complete: (results) => {
                            resolve(convert001To49Rows(results.data as any[]));
                        },
                        error: (err) => reject(err)
                    });
                });
            } else {
                const arrayBuffer = await file.arrayBuffer();
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(arrayBuffer);
                const worksheet = workbook.worksheets[0];
                
                if (!worksheet) {
                    throw new Error("No worksheet found in Excel file.");
                }

                const rawRows: any[][] = [];
                worksheet.eachRow({ includeEmpty: false }, (row) => {
                    const rowValues = row.values as any[];
                    const extracted = (Array.isArray(rowValues) ? rowValues.slice(1) : []).map(val => extractCellValue(val));
                    rawRows.push(extracted);
                });

                if (rawRows.length === 0) {
                    return [];
                }

                // Header detection by looking for common accounting column keywords
                let headerRowIndex = 0;
                const headerKeywords = ['offset account', 'account no', 'posting date', 'debit amount', 'credit amount', 'description', 'journal number', 'account'];
                for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                    const rowStr = rawRows[i].map(c => String(c || '').toLowerCase()).join(' ');
                    if (headerKeywords.some(kw => rowStr.includes(kw))) {
                        headerRowIndex = i;
                        break;
                    }
                }

                const headers = rawRows[headerRowIndex].map(c => String(c || '').trim());
                const dataRows = rawRows.slice(headerRowIndex + 1);

                const rows: any[] = [];
                dataRows.forEach(rowValues => {
                    const rowObj: any = {};
                    let hasData = false;
                    headers.forEach((header, index) => {
                        if (header && index < rowValues.length) {
                            const val = rowValues[index];
                            if (val !== undefined && val !== null && val !== '') {
                                hasData = true;
                            }
                            rowObj[header] = val;
                        }
                    });
                    if (hasData) {
                        rows.push(rowObj);
                    }
                });

                const convertedEntries = convert001To49Rows(rows);
                return convertedEntries;
            }
        } catch (err) {
            throw err;
        }
    };

    const handleProcess = async () => {
        if (selectedFiles.length === 0) {
            setErrors({ general: "Please upload an Excel/CSV file." });
            return;
        }
        setIsLoading(true);
        setErrors({});
        setJournalEntriesByFile({});

        for (const file of selectedFiles) {
            setFileStatuses(prev => ({ ...prev, [file.name]: 'processing' }));
            try {
                const entries = await processExcelFile(file);
                if (entries.length === 0) {
                    setErrors(prev => ({ 
                        ...prev, 
                        [file.name]: "No matching rows found in file. Please ensure the Excel file contains accounting data with Offset Account starting with 50-." 
                    }));
                    setFileStatuses(prev => ({ ...prev, [file.name]: 'error' }));
                } else {
                    setJournalEntriesByFile(prev => ({ ...prev, [file.name]: entries }));
                    setFileStatuses(prev => ({ ...prev, [file.name]: 'done' }));
                }
            } catch (err: any) {
                setErrors(prev => ({ ...prev, [file.name]: err.message || "Error processing file." }));
                setFileStatuses(prev => ({ ...prev, [file.name]: 'error' }));
            }
        }

        setIsLoading(false);
    };

    const handleDownload = async () => {
        if (Object.keys(journalEntriesByFile).length === 0) return;

        const allEntries = Object.values(journalEntriesByFile).flat();
        if (allEntries.length === 0) return;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Converted Entries");
        worksheet.addRow(CONVERT_OUTPUT_HEADERS);
        
        allEntries.forEach(entry => {
            const rowArr = CONVERT_OUTPUT_HEADERS.map(header => entry[header]);
            worksheet.addRow(rowArr);
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        await downloadBlob(blob, "Converted_49_000001.xlsx");
    };

    // To display them using JournalEntryTable, map to expected keys
    const previewEntries = useMemo(() => {
        const all = Object.values(journalEntriesByFile).flat();
        return all.map(row => ({
            journalNumber: row["Journal Number"],
            journalName: row["Journal Name"],
            lineNum: row["Line Num"],
            postingDate: row["Posting Date"],
            accountType: row["Account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6"],
            accountNo: row["Account No"],
            description: row["Description"],
            debitAmount: row["Debit Amount"],
            creditAmount: row["Credit Amount"],
            currencyCode: row["Currency Code"],
            exchangeRate: row["Exchange Rate"],
            offsetAccountType: row["Offset account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6"],
            offsetAccount: row["Offset account"],
            invoiceNo: row["Invoice No"],
            documentNo: row["Document No"],
            documentDate: row["Document Date"],
            dueDate: row["Due Date"],
            assetTransType: row["Asset trans type - Acq - 1 / Depre - 3"],
            postingProfile: row["Posting Profile"],
            paymentMode: row["Payment Mode"],
            paymentReference: row["Payment Reference"],
            numberOfVoucher: row["Number of Voucher"],
            activities: row["Activities"],
            country: row["Country"],
            departments: row["Departments"],
            projectId: row["Project_ID"],
            propertyId: row["Property_ID"]
        })) as JournalEntry[];
    }, [journalEntriesByFile]);

    const filteredEntries = useMemo(() => {
        if (!searchTerm.trim()) return previewEntries;
        const lower = searchTerm.toLowerCase();
        return previewEntries.filter(entry => 
            Object.values(entry).some(value => String(value).toLowerCase().includes(lower))
        );
    }, [previewEntries, searchTerm]);

    const handleEntryEdit = useCallback((index: number, field: keyof JournalEntry, value: string | number) => {
        // Map camelCase keys back to the excel header strings
        const keyMap: Record<string, string> = {
            journalNumber: "Journal Number",
            journalName: "Journal Name",
            lineNum: "Line Num",
            postingDate: "Posting Date",
            accountType: "Account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6",
            accountNo: "Account No",
            description: "Description",
            debitAmount: "Debit Amount",
            creditAmount: "Credit Amount",
            currencyCode: "Currency Code",
            exchangeRate: "Exchange Rate",
            offsetAccountType: "Offset account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6",
            offsetAccount: "Offset account",
            invoiceNo: "Invoice No",
            documentNo: "Document No",
            documentDate: "Document Date",
            dueDate: "Due Date",
            assetTransType: "Asset trans type - Acq - 1 / Depre - 3",
            postingProfile: "Posting Profile",
            paymentMode: "Payment Mode",
            paymentReference: "Payment Reference",
            numberOfVoucher: "Number of Voucher",
            activities: "Activities",
            country: "Country",
            departments: "Departments",
            projectId: "Project_ID",
            propertyId: "Property_ID"
        };
        
        const originalKey = keyMap[field];
        if (!originalKey) return;

        // Since filteredEntries is mapped from journalEntriesByFile sequentially per file,
        // we can find the matching file and index.
        let currentIndex = 0;
        setJournalEntriesByFile(prev => {
            const newState = { ...prev };
            for (const [fileName, entries] of Object.entries(newState)) {
                if (index < currentIndex + entries.length) {
                    const localIndex = index - currentIndex;
                    newState[fileName] = [...entries];
                    newState[fileName][localIndex] = { 
                        ...newState[fileName][localIndex], 
                        [originalKey]: value 
                    };
                    break;
                }
                currentIndex += entries.length;
            }
            return newState;
        });
    }, [previewEntries]);

    const hasErrors = Object.keys(errors).length > 0;
    const hasJournalEntries = previewEntries.length > 0;

    return (
        <div>
            <Header />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Input Panel */}
                <div className="bg-dark-200 p-6 rounded-lg shadow-lg">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-slate-200">1. Upload Input Excel</h2>
                         {selectedFiles.length > 0 && (
                            <button onClick={resetState} className="text-sm text-sky-400 hover:text-sky-300">Start Over</button>
                        )}
                    </div>
                    
                    <div 
                        className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dark-300 border-dashed rounded-md cursor-pointer hover:border-sky-500 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <div className="space-y-1 text-center">
                            <ProcessIcon className="mx-auto h-12 w-12 text-slate-500" />
                            <div className="flex text-sm text-slate-500 justify-center">
                                <label className="relative cursor-pointer bg-dark-200 rounded-md font-medium text-sky-500 hover:text-sky-400">
                                    <span>Upload Excel Files</span>
                                    <input type="file" className="sr-only" multiple onChange={handleFileChange} ref={fileInputRef} accept=".xlsx,.xls,.csv" />
                                </label>
                            </div>
                        </div>
                    </div>

                    {selectedFiles.length > 0 && (
                        <div className="mt-4 space-y-2">
                             {selectedFiles.map((f, i) => (
                                 <div key={i} className="flex justify-between p-2 bg-dark-300 rounded text-sm text-slate-300 items-center">
                                     <span>{f.name}</span>
                                     <button onClick={() => handleRemoveFile(f.name)} className="text-slate-500 hover:text-red-400"><XIcon className="w-4 h-4"/></button>
                                 </div>
                             ))}
                        </div>
                    )}

                    <div className="mt-6">
                        <button
                            onClick={handleProcess}
                            disabled={isLoading || selectedFiles.length === 0}
                            className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-600"
                        >
                            {isLoading ? <SpinnerIcon className="animate-spin -ml-1 mr-3 h-5 w-5" /> : <ProcessIcon className="-ml-1 mr-3 h-5 w-5" />}
                            Process File
                        </button>
                    </div>
                </div>

                {/* Output Panel */}
                <div className="bg-dark-200 p-6 rounded-lg shadow-lg flex flex-col">
                    <h2 className="text-xl font-semibold mb-4 text-slate-200">2. Results</h2>
                    
                    <div className="flex-grow flex flex-col justify-start space-y-4">
                       {hasErrors && Object.entries(errors).map(([fileName, errorMsg]) => (
                            <div key={fileName} className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md">
                                <strong className="font-bold">{fileName}: </strong> <span>{errorMsg}</span>
                            </div>
                        ))}
                        
                        {hasJournalEntries && (
                            <div className="space-y-4">
                                 <JournalEntryTable
                                    headers={CONVERT_OUTPUT_HEADERS}
                                    entries={filteredEntries}
                                    searchTerm={searchTerm}
                                    onSearchChange={setSearchTerm}
                                    onEntryEdit={handleEntryEdit}
                                />
                                <button
                                    onClick={handleDownload}
                                    className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                                >
                                    <DownloadIcon className="-ml-1 mr-3 h-5 w-5" />
                                    Download Converted Excel
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Convert001To49Automation;
