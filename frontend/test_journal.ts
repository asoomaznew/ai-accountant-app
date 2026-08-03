import { generateJournalEntries } from './services/journalService';
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('../backend/debug_output.json', 'utf-8'));
const entries = generateJournalEntries(data, undefined, true, undefined, 'Medical Harbour_POS corporate(459637) statement 01 Jul 2026-31 Jul 2026.csv');

const accToJournalNumber = new Set();
for (const entry of entries) {
    accToJournalNumber.add(`${entry.accountNo} -> Journal ${entry.journalNumber} (${entry.journalName})`);
}

console.log(Array.from(accToJournalNumber).sort().join('\n'));
