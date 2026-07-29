from pathlib import Path
import pandas as pd
from engines.base_engine import BaseEngine
from models import RouterResult, ExtractedDocument
from services.text_extractor import TextExtractor
from config.settings import TEXT_PREVIEW_LIMIT, DEFAULT_CURRENCY

class BankStatementEngine(BaseEngine):
    def __init__(self):
        self.extractor = TextExtractor()

    def process(self, file_path: Path, router_result: RouterResult) -> ExtractedDocument:
        if file_path.suffix.lower() == ".pdf":
            text, method = self.extractor.extract_pdf_text(file_path)
            tables = self.extractor.extract_pdf_tables_text(file_path)
            combined = (text + "\n" + tables).strip()
        else:
            df = self.extractor.read_table_file(file_path)
            method = "PANDAS"
            combined = df.head(50).to_string(index=False)
        return ExtractedDocument(
            source_file=file_path.name,
            document_type="BANK_STATEMENT",
            description="Bank statement extraction",
            amount=0,
            currency=DEFAULT_CURRENCY,
            text_preview=combined[:TEXT_PREVIEW_LIMIT],
            metadata={"extract_method": method, "router_reasons": router_result.reasons},
        )
