# AI Accountant - Remix Entry Automation

An automated accounting system designed for processing statements, journal entries, and PDF search tasks in KWD (Kuwaiti Dinars).

## 🚀 Key Features

1. **Journal Entry Automation:** Automatically extracts and structures transactions from PDF/Excel statements to map matching double-entry lines for Clover, Warba, and POS systems.
2. **Convert 001 to 49:** Batch mapping tool that filters Clover offset accounts (`50-xxxxxx` representing 001 ledger lines) and transforms them to Customer accounts (`49-000001`).
3. **Ending Balance Extraction:** Instantly parses ending/closing reconciliation balances from uploaded statement sheets.
4. **Smart PDF Merger:** Combines and matches CSV records with their respective source PDF receipt pages.
5. **PDF Q&A & Keyword Search:** Search multiple PDFs for keywords or chat with them using local or cloud AI models.

---

## 🤖 AI Model Providers

The application supports three flexible model providers configured under the **AI Settings** tab:

1. **Ollama (Local Server):**
   - 100% private, offline option.
   - Reads from your local Ollama server running on `http://localhost:11434` (requires models like `qwen2.5:7b` or `mistral` downloaded).
2. **WebLLM (Local Browser WebGPU):**
   - Runs model weights directly inside your browser using WebGPU acceleration.
   - Downloaded weights are cached in your browser storage. Works fully offline after the initial load.
3. **Python Only (Rules Engine):**
   - Bypasses all AI models entirely.
   - Fast, lightweight document parsing using local Python rules and regex matching.

---

## 🔒 Privacy & Offline Execution
- **Ollama / WebLLM:** All statement text, transactions, and invoice files are processed strictly on your local machine and never leave your browser/computer.
- **Python Only:** All processing happens locally using rule-based parsing—no external AI services involved.

---

## 🛠️ Local Installation & Setup

1. Make sure you have **Node.js** installed.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the local server in development mode:
   ```bash
   npm run dev
   ```
5. Alternatively, double-click the `run_app.command` script in the parent directory to start the application automatically.

---

## 🧪 Testing

Run unit tests covering accounting mappings and formatting logic:
```bash
npm run test
```
