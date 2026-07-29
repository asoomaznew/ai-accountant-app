from pathlib import Path
from engines.base_engine import BaseEngine
from models import RouterResult, ExtractedDocument
from services.text_extractor import TextExtractor
from config.settings import DEFAULT_CURRENCY, TEXT_PREVIEW_LIMIT
import pandas as pd

class TableEngine(BaseEngine):
    def __init__(self):
        self.extractor = TextExtractor()

    def process(self, file_path: Path, router_result: RouterResult) -> ExtractedDocument:
        df = self.extractor.read_table_file(file_path)
        amount_col = self._amount_column(df)
        amount = 0
        if amount_col:
            df[amount_col] = pd.to_numeric(df[amount_col], errors="coerce").fillna(0)
            amount = float(df[amount_col].sum())
        return ExtractedDocument(
            source_file=file_path.name,
            document_type="TABLE_FILE",
            description="Structured table file",
            amount=amount,
            currency=DEFAULT_CURRENCY,
            text_preview=df.head(20).to_string(index=False)[:TEXT_PREVIEW_LIMIT],
            metadata={"columns": list(df.columns), "amount_column": amount_col},
        )

    def _amount_column(self, df):
        lower = {str(c).lower().strip(): c for c in df.columns}
        for name in ["amount", "total", "net amount", "gross amount", "debit", "credit", "balance"]:
            if name in lower:
                return lower[name]
        return ""
