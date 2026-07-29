from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Any
from pydantic import BaseModel, Field, field_validator

DEFAULT_CURRENCY = "KWD"

class DocumentType(str, Enum):
    INVOICE = "INVOICE"
    BANK_STATEMENT = "BANK_STATEMENT"
    PAYMENT_VOUCHER = "PAYMENT_VOUCHER"
    CONTRACT = "CONTRACT"
    LICENSE = "LICENSE"
    LEASE = "LEASE"
    TABLE_FILE = "TABLE_FILE"
    UNKNOWN = "UNKNOWN"

class RouteAction(str, Enum):
    SEND_TO_OCR = "SEND_TO_OCR"
    SEND_TO_INVOICE_ENGINE = "SEND_TO_INVOICE_ENGINE"
    SEND_TO_BANK_ENGINE = "SEND_TO_BANK_ENGINE"
    SEND_TO_CONTRACT_ENGINE = "SEND_TO_CONTRACT_ENGINE"
    SEND_TO_LICENSE_ENGINE = "SEND_TO_LICENSE_ENGINE"
    SEND_TO_TABLE_ENGINE = "SEND_TO_TABLE_ENGINE"
    MANUAL_REVIEW = "MANUAL_REVIEW"

@dataclass
class RouterResult:
    file_path: str
    file_extension: str
    file_family: str
    document_type: DocumentType
    route_action: RouteAction
    needs_ocr: bool
    has_selectable_text: bool
    text_length: int
    language: str
    confidence: int
    reasons: List[str] = field(default_factory=list)

class ExtractedDocument(BaseModel):
    source_file: str = ""
    document_type: str = "UNKNOWN"
    supplier_name: str = ""
    matched_supplier: str = ""
    supplier_match_score: float = 0
    invoice_no: str = ""
    document_no: str = ""
    invoice_date: str = ""
    document_date: str = ""
    due_date: str = ""
    description: str = ""
    amount: float = 0
    vat_amount: float = 0
    currency: str = DEFAULT_CURRENCY
    text_preview: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("currency")
    @classmethod
    def clean_currency(cls, value: str) -> str:
        return (value or DEFAULT_CURRENCY).strip().upper()

class D365JournalLine(BaseModel):
    journal_name: str = "GenJrn"
    posting_date: str = Field(default_factory=lambda: datetime.now().strftime("%d/%m/%Y"))
    account_type: int = Field(default=0, ge=0)
    account_no: str = ""
    description: str = ""
    debit_amount: float = Field(default=0, ge=0)
    credit_amount: float = Field(default=0, ge=0)
    currency_code: str = DEFAULT_CURRENCY
    exchange_rate: float = Field(default=1, gt=0)
    offset_account_type: int = Field(default=2, ge=0)
    offset_account: str = ""
    invoice_no: str = ""
    document_no: str = ""
    document_date: str = ""
    due_date: str = ""
    asset_trans_type: str = ""
    posting_profile: str = ""
    payment_mode: str = ""
    payment_reference: str = ""
    number_of_voucher: str = ""
    activities: str = ""
    country: str = "KW"
    departments: str = ""
    project_id: str = ""
    property_id: str = ""
    unit_id: str = ""
    confidence: int = Field(default=0, ge=0, le=100)
    notes: str = ""

    @field_validator("currency_code")
    @classmethod
    def clean_currency_code(cls, value: str) -> str:
        return (value or DEFAULT_CURRENCY).strip().upper()

    def to_d365_row(self, journal_number: str, line_num: int, source_file_stem: str) -> list:
        return [
            journal_number,
            self.journal_name,
            line_num,
            self.posting_date,
            self.account_type,
            self.account_no,
            self.description,
            self.debit_amount,
            self.credit_amount,
            self.currency_code,
            self.exchange_rate,
            self.offset_account_type,
            self.offset_account,
            self.invoice_no,
            self.document_no or source_file_stem,
            self.document_date or self.posting_date,
            self.due_date or self.document_date or self.posting_date,
            self.asset_trans_type,
            self.posting_profile,
            self.payment_mode,
            self.payment_reference,
            self.number_of_voucher,
            self.activities,
            self.country,
            self.departments,
            self.project_id,
            self.property_id,
            self.unit_id,
        ]
