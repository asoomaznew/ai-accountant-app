from pathlib import Path
import re
from engines.base_engine import BaseEngine
from models import RouterResult, ExtractedDocument
from services.text_extractor import TextExtractor
from services.master_data_engine import MasterDataEngine
from config.settings import TEXT_PREVIEW_LIMIT, DEFAULT_CURRENCY

class InvoiceEngine(BaseEngine):
    def __init__(self):
        self.extractor = TextExtractor()
        self.master = MasterDataEngine()

    def process(self, file_path: Path, router_result: RouterResult) -> ExtractedDocument:
        text, method = self.extractor.extract_pdf_text(file_path) if file_path.suffix.lower() == ".pdf" else ("", "TABLE")
        cleaned = re.sub(r"\s+", " ", text or "").strip()
        supplier_hint = cleaned[:160]
        date = self._first_date(cleaned)
        amount = self._probable_amount(cleaned)
        vat = self._vat_amount(cleaned)
        invoice_no = self._invoice_no(cleaned)
        vendor_account, match_score = self.master.match_vendor(supplier_hint)
        return ExtractedDocument(
            source_file=file_path.name,
            document_type="INVOICE",
            supplier_name=supplier_hint,
            matched_supplier=vendor_account,
            supplier_match_score=match_score,
            invoice_no=invoice_no,
            document_no=invoice_no,
            invoice_date=date,
            document_date=date,
            due_date=date,
            description=f"Supplier invoice {invoice_no}" if invoice_no else "Supplier invoice",
            amount=amount,
            vat_amount=vat,
            currency=DEFAULT_CURRENCY,
            text_preview=cleaned[:TEXT_PREVIEW_LIMIT],
            metadata={"extract_method": method, "router_reasons": router_result.reasons},
        )

    def _first_date(self, text: str) -> str:
        m = re.search(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b", text)
        return m.group(1) if m else ""

    def _probable_amount(self, text: str) -> float:
        vals = []
        for raw in re.findall(r"\b\d{1,3}(?:,\d{3})*(?:\.\d{1,3})?\b|\b\d+(?:\.\d{1,3})?\b", text):
            try:
                v = float(raw.replace(",", ""))
                if 0 < v < 100000000:
                    vals.append(v)
            except Exception:
                pass
        return max(vals) if vals else 0

    def _vat_amount(self, text: str) -> float:
        m = re.search(r"(?:VAT|Tax)\D{0,20}(\d+(?:\.\d{1,3})?)", text, re.I)
        return float(m.group(1)) if m else 0

    def _invoice_no(self, text: str) -> str:
        m = re.search(r"(?:Invoice\s*(?:No|Number)?|Inv\.?\s*No)\D{0,15}([A-Za-z0-9\-/]+)", text, re.I)
        return m.group(1) if m else ""
