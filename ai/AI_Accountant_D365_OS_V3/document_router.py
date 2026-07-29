from pathlib import Path
import re
import fitz
from models import DocumentType, RouteAction, RouterResult
from config.settings import TEXT_PREVIEW_LIMIT

class DocumentRouter:
    def __init__(self, preview_limit: int = TEXT_PREVIEW_LIMIT):
        self.preview_limit = preview_limit

    def extract_pdf_preview(self, pdf_path: str) -> tuple[str, bool]:
        text_parts = []
        try:
            doc = fitz.open(pdf_path)
            for page in doc:
                page_text = page.get_text("text") or ""
                if page_text.strip():
                    text_parts.append(page_text)
                if len(" ".join(text_parts)) >= self.preview_limit:
                    break
            doc.close()
            preview = "\n".join(text_parts).strip()
            return preview[:self.preview_limit], len(preview) >= 100
        except Exception:
            return "", False

    def detect_language(self, text: str) -> str:
        arabic_chars = len(re.findall(r"[\u0600-\u06FF]", text or ""))
        english_chars = len(re.findall(r"[A-Za-z]", text or ""))
        if arabic_chars == 0 and english_chars == 0:
            return "UNKNOWN"
        if arabic_chars > 0 and english_chars > 0:
            return "MIXED"
        if arabic_chars > english_chars:
            return "ARABIC"
        return "ENGLISH"

    def score_keywords(self, text: str) -> tuple[DocumentType, int, list[str]]:
        txt = (text or "").lower()
        scores = {k: 0 for k in [DocumentType.BANK_STATEMENT, DocumentType.INVOICE, DocumentType.PAYMENT_VOUCHER, DocumentType.CONTRACT, DocumentType.LICENSE, DocumentType.LEASE]}
        reasons = []
        rules = {
            DocumentType.BANK_STATEMENT: {"bank statement": 35, "opening balance": 25, "closing balance": 25, "account statement": 25, "transaction date": 15, "debit": 8, "credit": 8, "balance": 10},
            DocumentType.INVOICE: {"tax invoice": 35, "invoice number": 30, "invoice no": 25, "amount due": 20, "vat": 15, "total amount": 15, "supplier": 10},
            DocumentType.PAYMENT_VOUCHER: {"payment voucher": 35, "payment reference": 25, "paid amount": 20, "beneficiary": 15, "transfer": 10},
            DocumentType.CONTRACT: {"agreement": 25, "contract": 25, "terms and conditions": 20, "party": 10},
            DocumentType.LICENSE: {"license no": 30, "licence no": 30, "expiry date": 25, "authority": 15, "ministry": 10},
            DocumentType.LEASE: {"lease": 30, "rent": 20, "tenant": 20, "landlord": 15, "unit": 10},
        }
        for doc_type, kw_rules in rules.items():
            for keyword, weight in kw_rules.items():
                if keyword in txt:
                    scores[doc_type] += weight
                    reasons.append(f"{doc_type.value}: found '{keyword}' (+{weight})")
        best_type = max(scores, key=scores.get)
        best_score = scores[best_type]
        if best_score == 0:
            return DocumentType.UNKNOWN, 30, ["No strong keyword match found"]
        return best_type, min(95, max(40, best_score)), reasons

    def decide_action(self, document_type: DocumentType, needs_ocr: bool, confidence: int) -> RouteAction:
        if needs_ocr:
            return RouteAction.SEND_TO_OCR
        if confidence < 50:
            return RouteAction.MANUAL_REVIEW
        return {
            DocumentType.INVOICE: RouteAction.SEND_TO_INVOICE_ENGINE,
            DocumentType.BANK_STATEMENT: RouteAction.SEND_TO_BANK_ENGINE,
            DocumentType.CONTRACT: RouteAction.SEND_TO_CONTRACT_ENGINE,
            DocumentType.LICENSE: RouteAction.SEND_TO_LICENSE_ENGINE,
            DocumentType.TABLE_FILE: RouteAction.SEND_TO_TABLE_ENGINE,
        }.get(document_type, RouteAction.MANUAL_REVIEW)

    def route(self, file_path: str) -> RouterResult:
        path = Path(file_path)
        ext = path.suffix.lower()
        if ext == ".pdf":
            preview, has_text = self.extract_pdf_preview(file_path)
            needs_ocr = not has_text
            language = self.detect_language(preview)
            if needs_ocr:
                return RouterResult(str(path), ext, "PDF", DocumentType.UNKNOWN, RouteAction.SEND_TO_OCR, True, False, len(preview), language, 50, ["PDF has little/no selectable text", "OCR required before classification"])
            doc_type, confidence, reasons = self.score_keywords(preview)
            return RouterResult(str(path), ext, "PDF", doc_type, self.decide_action(doc_type, False, confidence), False, True, len(preview), language, confidence, reasons)
        if ext in [".xlsx", ".xlsm", ".xls", ".csv"]:
            return RouterResult(str(path), ext, "TABLE", DocumentType.TABLE_FILE, RouteAction.SEND_TO_TABLE_ENGINE, False, True, 0, "UNKNOWN", 70, ["Structured table file", "Send to pandas table engine"])
        return RouterResult(str(path), ext, "UNKNOWN", DocumentType.UNKNOWN, RouteAction.MANUAL_REVIEW, False, False, 0, "UNKNOWN", 0, ["Unsupported file extension"])
