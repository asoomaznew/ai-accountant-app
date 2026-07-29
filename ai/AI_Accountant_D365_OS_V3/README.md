# AI Accountant D365 OS V3

Production-style architecture for routing accounting documents into specialised business engines, then producing D365 journal upload files.

## Core flow

```text
Document Router
  -> Invoice / Bank / Table Engine
  -> Accounting Rule Engine
  -> AI Enrichment Layer, only if needed
  -> Pydantic validation
  -> Confidence Engine
  -> D365 Excel Export + SQLite Audit
```

## Install

```bash
pip install -r requirements.txt
```

Optional OCR:

```bash
pip install easyocr
pip install paddleocr paddlepaddle
```

Mac OCR:

```bash
brew install tesseract
brew install tesseract-lang
```

## Run

```bash
python main.py
```

Place files in `input_files/`. Outputs are generated in `output_files/`.

## D365 columns

```json
[
  "Journal Number",
  "Journal Name",
  "Line Num",
  "Posting Date",
  "Account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6",
  "Account No",
  "Description",
  "Debit Amount",
  "Credit Amount",
  "Currency Code",
  "Exchange Rate",
  "Offset account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6",
  "Offset account",
  "Invoice No",
  "Document No",
  "Document Date",
  "Due Date",
  "Asset trans type - Acq - 1 / Depre - 3",
  "Posting Profile",
  "Payment Mode",
  "Payment Reference",
  "Number of Voucher",
  "Activities",
  "Country",
  "Departments",
  "Project_ID",
  "Property_ID",
  "Unit_ID"
]
```
