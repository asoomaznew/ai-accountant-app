import React from 'react';
import { JournalEntry } from '../types';
import { SearchIcon } from './icons';

interface JournalEntryTableProps {
    entries: JournalEntry[];
    headers: string[];
    searchTerm: string;
    onSearchChange: (term: string) => void;
    onEntryEdit?: (index: number, field: keyof JournalEntry, value: string | number) => void;
}

const EditableCell = ({ 
    value, 
    onChange, 
    type = "text", 
    className = "" 
}: { 
    value: string | number, 
    onChange: (val: string) => void,
    type?: string,
    className?: string
}) => {
    return (
        <input
            type={type}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full bg-transparent border border-transparent hover:border-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded px-1 py-0.5 text-sm transition-colors outline-none ${className}`}
        />
    );
};

const JournalEntryTable: React.FC<JournalEntryTableProps> = ({ entries, headers, searchTerm, onSearchChange, onEntryEdit }) => {
    
    const handleEdit = (index: number, field: keyof JournalEntry, value: string) => {
        if (onEntryEdit) {
            onEntryEdit(index, field, value);
        }
    };

    return (
        <div className="bg-dark-300/50 p-4 rounded-lg border border-dark-300 animate-fade-in w-full">
            <div className="relative mb-4">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <SearchIcon className="w-5 h-5 text-slate-400" />
                </span>
                <input
                    type="search"
                    placeholder="Search entries..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-md bg-dark-300 text-slate-200 border border-slate-600 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                    aria-label="Search journal entries"
                />
            </div>
            <div className="overflow-auto w-full" style={{ maxHeight: '450px' }}>
                <table className="min-w-full text-sm text-left text-slate-300 table-auto">
                    <thead className="text-xs text-sky-400 uppercase bg-dark-300/50 sticky top-0 backdrop-blur-sm z-10">
                        <tr>
                            {headers.map(header => (
                                <th key={header} scope="col" className="px-4 py-2 whitespace-nowrap">{header}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-300">
                        {entries.slice(0, 100).map((entry, index) => (
                            <tr key={index} className="hover:bg-dark-300">
                              <td className="px-2 py-1 min-w-[80px]">
                                  <EditableCell value={entry.journalNumber} onChange={(v) => handleEdit(index, 'journalNumber', Number(v))} type="number" />
                              </td>
                              <td className="px-2 py-1 min-w-[100px]">
                                  <EditableCell value={entry.journalName} onChange={(v) => handleEdit(index, 'journalName', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[80px]">
                                  <EditableCell value={entry.lineNum} onChange={(v) => handleEdit(index, 'lineNum', Number(v))} type="number" />
                              </td>
                              <td className="px-2 py-1 min-w-[120px]">
                                  <EditableCell value={entry.postingDate} onChange={(v) => handleEdit(index, 'postingDate', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[120px]">
                                  <EditableCell value={entry.accountType} onChange={(v) => handleEdit(index, 'accountType', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[150px]">
                                  <EditableCell value={entry.accountNo} onChange={(v) => handleEdit(index, 'accountNo', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[250px]">
                                  <EditableCell value={entry.description} onChange={(v) => handleEdit(index, 'description', v)} className="w-full" />
                              </td>
                              <td className="px-2 py-1 min-w-[100px]">
                                  <EditableCell value={entry.debitAmount} onChange={(v) => handleEdit(index, 'debitAmount', Number(v))} type="number" />
                              </td>
                              <td className="px-2 py-1 min-w-[100px]">
                                  <EditableCell value={entry.creditAmount} onChange={(v) => handleEdit(index, 'creditAmount', Number(v))} type="number" />
                              </td>
                              <td className="px-2 py-1 min-w-[80px]">
                                  <EditableCell value={entry.currencyCode} onChange={(v) => handleEdit(index, 'currencyCode', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[80px]">
                                  <EditableCell value={entry.exchangeRate} onChange={(v) => handleEdit(index, 'exchangeRate', Number(v))} type="number" />
                              </td>
                              <td className="px-2 py-1 min-w-[120px]">
                                  <EditableCell value={entry.offsetAccountType} onChange={(v) => handleEdit(index, 'offsetAccountType', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[150px]">
                                  <EditableCell value={entry.offsetAccount} onChange={(v) => handleEdit(index, 'offsetAccount', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[150px]">
                                  <EditableCell value={entry.invoiceNo} onChange={(v) => handleEdit(index, 'invoiceNo', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[150px]">
                                  <EditableCell value={entry.documentNo} onChange={(v) => handleEdit(index, 'documentNo', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[120px]">
                                  <EditableCell value={entry.documentDate} onChange={(v) => handleEdit(index, 'documentDate', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[120px]">
                                  <EditableCell value={entry.dueDate} onChange={(v) => handleEdit(index, 'dueDate', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[150px]">
                                  <EditableCell value={entry.assetTransType} onChange={(v) => handleEdit(index, 'assetTransType', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[150px]">
                                  <EditableCell value={entry.postingProfile} onChange={(v) => handleEdit(index, 'postingProfile', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[150px]">
                                  <EditableCell value={entry.paymentMode} onChange={(v) => handleEdit(index, 'paymentMode', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[150px]">
                                  <EditableCell value={entry.paymentReference} onChange={(v) => handleEdit(index, 'paymentReference', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[100px]">
                                  <EditableCell value={entry.numberOfVoucher} onChange={(v) => handleEdit(index, 'numberOfVoucher', Number(v))} type="number" />
                              </td>
                              <td className="px-2 py-1 min-w-[100px]">
                                  <EditableCell value={entry.activities} onChange={(v) => handleEdit(index, 'activities', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[100px]">
                                  <EditableCell value={entry.country} onChange={(v) => handleEdit(index, 'country', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[100px]">
                                  <EditableCell value={entry.departments} onChange={(v) => handleEdit(index, 'departments', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[100px]">
                                  <EditableCell value={entry.projectId} onChange={(v) => handleEdit(index, 'projectId', v)} />
                              </td>
                              <td className="px-2 py-1 min-w-[100px]">
                                  <EditableCell value={entry.propertyId} onChange={(v) => handleEdit(index, 'propertyId', v)} />
                              </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {entries.length > 100 && <p className="text-xs text-slate-500 text-center pt-2">Showing first 100 of {entries.length} matching entries...</p>}
            {entries.length === 0 && searchTerm && (
                <p className="text-center text-slate-400 py-4">No entries match your search.</p>
            )}
        </div>
    );
};

export default JournalEntryTable;