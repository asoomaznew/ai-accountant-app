from pathlib import Path
from document_router import DocumentRouter
from models import RouteAction
from engines.invoice_engine import InvoiceEngine
from engines.bank_statement_engine import BankStatementEngine
from engines.table_engine import TableEngine
from services.accounting_rule_engine import AccountingRuleEngine
from services.ai_enrichment_engine import AiEnrichmentEngine
from services.confidence_engine import ConfidenceEngine
from services.export_engine import ExportEngine
from services.ocr_engine import OcrEngine
from services.text_extractor import TextExtractor
from services.logger import log
from config.settings import INPUT_DIR, CONFIDENCE_AUTO_EXPORT_THRESHOLD

class AiAccountantV3:
    def __init__(self):
        self.router = DocumentRouter()
        self.invoice_engine = InvoiceEngine()
        self.bank_engine = BankStatementEngine()
        self.table_engine = TableEngine()
        self.rules = AccountingRuleEngine()
        self.ai = AiEnrichmentEngine()
        self.confidence = ConfidenceEngine()
        self.export = ExportEngine()
        self.extractor = TextExtractor()

    def process_file(self, file_path: Path):
        log(f"START {file_path.name}")
        route = self.router.route(str(file_path))
        log(f"ROUTE {route.route_action.value} | {route.document_type.value} | conf={route.confidence}")

        if route.route_action == RouteAction.SEND_TO_OCR:
            # OCR first, then re-classify from extracted text by using extraction engine path.
            # For V3 we send OCR PDFs to InvoiceEngine by default after OCR if classification is still unknown.
            extracted = self.invoice_engine.process(file_path, route)
        elif route.route_action == RouteAction.SEND_TO_INVOICE_ENGINE:
            extracted = self.invoice_engine.process(file_path, route)
        elif route.route_action == RouteAction.SEND_TO_BANK_ENGINE:
            extracted = self.bank_engine.process(file_path, route)
        elif route.route_action == RouteAction.SEND_TO_TABLE_ENGINE:
            extracted = self.table_engine.process(file_path, route)
        else:
            log(f"Manual review required: {file_path.name}", "WARNING")
            return None

        base_journal = self.rules.build_initial_journal(extracted)
        enriched_journal = self.ai.enrich(extracted, base_journal)
        final_confidence = self.confidence.score(route, extracted, enriched_journal)
        enriched_journal.confidence = final_confidence

        self.export.save_audit(route, extracted, enriched_journal, file_path)
        if final_confidence < CONFIDENCE_AUTO_EXPORT_THRESHOLD:
            log(f"Manual review queue: confidence={final_confidence}", "WARNING")
            return None

        out = self.export.export_d365_excel(enriched_journal, file_path)
        log(f"DONE {out}")
        return out

    def process_all(self):
        files = [p for p in INPUT_DIR.iterdir() if p.suffix.lower() in [".pdf", ".csv", ".xlsx", ".xlsm", ".xls"]]
        if not files:
            log(f"No supported files in {INPUT_DIR}", "WARNING")
        for file_path in files:
            try:
                self.process_file(file_path)
            except Exception as e:
                log(f"Failed {file_path.name}: {e}", "ERROR")

if __name__ == "__main__":
    app = AiAccountantV3()
    print("AI Accountant D365 OS V3")
    print("1) Process all files")
    choice = input("Choose: ").strip()
    if choice == "1":
        app.process_all()
