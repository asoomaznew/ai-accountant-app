from pathlib import Path
import pandas as pd
import fitz
try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except Exception:
    PDFPLUMBER_AVAILABLE = False
from services.ocr_engine import OcrEngine
from services.logger import log

class TextExtractor:
    def __init__(self):
        self.ocr = OcrEngine()

    def extract_pdf_text(self, pdf_path: Path) -> tuple[str, str]:
        text_parts = []
        try:
            doc = fitz.open(pdf_path)
            for i, page in enumerate(doc, start=1):
                txt = page.get_text("text") or ""
                if txt.strip():
                    text_parts.append(f"\n--- PAGE {i} ---\n{txt}")
            doc.close()
        except Exception as e:
            log(f"PyMuPDF extraction failed: {e}", "WARNING")
        text = "\n".join(text_parts).strip()
        if len(text) >= 100:
            return text, "PYMUPDF"
        ocr_text, engine = self.ocr.run(pdf_path)
        return ocr_text, engine

    def extract_pdf_tables_text(self, pdf_path: Path) -> str:
        if not PDFPLUMBER_AVAILABLE:
            return ""
        tables_text = []
        try:
            with pdfplumber.open(str(pdf_path)) as pdf:
                for page_no, page in enumerate(pdf.pages, start=1):
                    tables = page.extract_tables() or []
                    for table_no, table in enumerate(tables, start=1):
                        tables_text.append(f"\n--- TABLE {page_no}.{table_no} ---")
                        for row in table:
                            tables_text.append(" | ".join(str(c or "") for c in row))
        except Exception as e:
            log(f"pdfplumber table extraction failed: {e}", "WARNING")
        return "\n".join(tables_text).strip()

    def read_table_file(self, file_path: Path) -> pd.DataFrame:
        ext = file_path.suffix.lower()
        if ext == ".csv":
            df = pd.read_csv(file_path)
        elif ext in [".xlsx", ".xlsm"]:
            df = pd.read_excel(file_path, engine="openpyxl")
        elif ext == ".xls":
            df = pd.read_excel(file_path, engine="xlrd")
        else:
            raise ValueError(f"Unsupported table file: {ext}")
        df.columns = [str(c).strip().replace("\n", " ") for c in df.columns]
        df.dropna(how="all", inplace=True)
        return df
