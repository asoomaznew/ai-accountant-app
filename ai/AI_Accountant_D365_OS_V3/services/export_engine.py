from pathlib import Path
from datetime import datetime
from openpyxl import Workbook
from models import D365JournalLine, ExtractedDocument, RouterResult
from config.settings import D365_HEADERS, OUTPUT_DIR, DB_PATH
from sqlalchemy import create_engine
import pandas as pd

class ExportEngine:
    def export_d365_excel(self, journal: D365JournalLine, source_file: Path) -> Path:
        out = OUTPUT_DIR / f"{source_file.stem}_D365_journal_upload.xlsx"
        wb = Workbook()
        ws = wb.active
        ws.title = "Export"
        ws.append(D365_HEADERS)
        journal_no = "AIJE" + datetime.now().strftime("%Y%m%d%H%M%S")
        ws.append(journal.to_d365_row(journal_no, 1, source_file.stem))
        wb.save(out)
        return out

    def save_audit(self, router: RouterResult, extracted: ExtractedDocument, journal: D365JournalLine, source_file: Path):
        engine = create_engine(f"sqlite:///{DB_PATH}")
        row = {
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "source_file": source_file.name,
            "route_action": router.route_action.value,
            "document_type": router.document_type.value,
            "router_confidence": router.confidence,
            "router_reasons": " | ".join(router.reasons),
            **extracted.model_dump(),
            **{f"journal_{k}": v for k, v in journal.model_dump().items()},
        }
        pd.DataFrame([row]).to_sql("audit_log_v3", engine, if_exists="append", index=False)
