from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parents[1]
INPUT_DIR = BASE_DIR / "input_files"
OUTPUT_DIR = BASE_DIR / "output_files"
MASTER_DATA_DIR = BASE_DIR / "master_data"
LOG_DIR = BASE_DIR / "logs"
DB_PATH = BASE_DIR / "accounting_ai_v3.db"

for folder in [INPUT_DIR, OUTPUT_DIR, MASTER_DATA_DIR, LOG_DIR]:
    folder.mkdir(exist_ok=True)

MODEL_NAME = os.getenv("OLLAMA_MODEL", "qwen3:8b")
OLLAMA_OPENAI_BASE_URL = os.getenv("OLLAMA_OPENAI_BASE_URL", "http://localhost:11434/v1")
TEXT_PREVIEW_LIMIT = int(os.getenv("AI_TEXT_PREVIEW_LIMIT", "5000"))
OCR_ENGINE = os.getenv("AI_OCR_ENGINE", "auto").strip().lower()
OCR_LANGS = os.getenv("AI_OCR_LANGS", "eng").strip()
OCR_DPI = int(os.getenv("AI_OCR_DPI", "250"))
OCR_MAX_PAGES = int(os.getenv("AI_OCR_MAX_PAGES", "5"))
CONFIDENCE_AUTO_EXPORT_THRESHOLD = int(os.getenv("AI_CONFIDENCE_AUTO_EXPORT", "80"))
DEFAULT_CURRENCY = "KWD"

D365_HEADERS = [
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
    "Unit_ID",
]
