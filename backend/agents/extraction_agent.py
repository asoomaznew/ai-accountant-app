import os
import re
import logging
import pandas as pd
from typing import Dict, Any

logger = logging.getLogger(__name__)


def _extract_with_pdfplumber(file_path: str) -> str:
    import pdfplumber
    parts = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
    return "\n".join(parts)


def _extract_with_pypdfium2(file_path: str) -> str:
    """PyPDFium2 — available in the venv and reads many PDFs that
    pdfplumber rejects (e.g. 'No /Root object', odd encodings)."""
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(file_path)
    try:
        return "\n".join(pdf[i].get_textpage().get_text_range() for i in range(len(pdf)))
    finally:
        pdf.close()


# Ordered fallbacks: try the most accurate first, degrade gracefully.
_PDF_BACKENDS = [
    ("pdfplumber", _extract_with_pdfplumber),
    ("pypdfium2", _extract_with_pypdfium2),
]


class ExtractionAgent:
    """
    Agent responsible for extracting raw text or data tables from uploaded files.
    No LLM calls are made here.

    PDF extraction is layered: if pdfplumber fails (corrupt structure,
    "No /Root object", encrypted/odd encodings), we fall back to fitz (PyMuPDF)
    and then pypdf instead of returning empty text — so the downstream
    pipeline still gets readable text instead of a hard failure.
    """

    def __init__(self):
        self._ACCOUNT_PATTERN = re.compile(
            r"(?:Account\s*Number|A/C\s*No\.?|Account)\s*[:\-]?\s*([\w\d\-]+)",
            re.IGNORECASE,
        )

    def extract_text_and_tables(self, file_path: str, filename: str) -> Dict[str, Any]:
        filename_lower = filename.lower()
        account_number = "N/A"
        raw_text = ""
        dataframes = {}

        if filename_lower.endswith((".csv", ".xlsx", ".xls")):
            logger.info(f"ExtractionAgent: Parsing tabular file {filename}")
            try:
                if filename_lower.endswith(".csv"):
                    df = pd.read_csv(file_path, dtype=str)
                    dataframes["csv"] = df
                    raw_text = df.to_string(index=False)
                else:
                    xl = pd.ExcelFile(file_path)
                    sheet_texts = []
                    for sheet_name in xl.sheet_names:
                        df = pd.read_excel(file_path, sheet_name=sheet_name, dtype=str)
                        dataframes[sheet_name] = df
                        sheet_texts.append(f"--- Sheet: {sheet_name} ---\n" + df.to_string(index=False))
                    raw_text = "\n\n".join(sheet_texts)
            except Exception as e:
                logger.error(f"Error reading tabular data in ExtractionAgent: {e}")
                raw_text = ""
        else:
            logger.info(f"ExtractionAgent: Parsing PDF file {filename}")
            raw_text = self._extract_pdf_with_fallback(file_path, filename)
            acc_match = self._ACCOUNT_PATTERN.search(raw_text)
            if acc_match:
                account_number = acc_match.group(1)

        return {
            "text": raw_text,
            "dataframes": dataframes,
            "account_number": account_number,
            "filename": filename,
        }

    def _extract_pdf_with_fallback(self, file_path: str, filename: str) -> str:
        last_err: Exception | None = None
        for name, fn in _PDF_BACKENDS:
            try:
                text = fn(file_path)
                if text and text.strip():
                    logger.info(f"ExtractionAgent: PDF parsed via {name} ({len(text)} chars)")
                    return text
                logger.warning(f"ExtractionAgent: {name} returned empty text")
            except Exception as e:  # noqa: BLE001 — try next backend
                last_err = e
                logger.warning(f"ExtractionAgent: {name} failed on {filename}: {e}")
        logger.error(f"ExtractionAgent: all PDF backends failed for {filename}: {last_err}")
        return ""
