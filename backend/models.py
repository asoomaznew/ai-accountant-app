from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum

class DocumentType(str, Enum):
    INVOICE = "INVOICE"
    BANK_STATEMENT = "BANK_STATEMENT"
    PAYMENT_VOUCHER = "PAYMENT_VOUCHER"
    CONTRACT = "CONTRACT"
    LICENSE = "LICENSE"
    LEASE = "LEASE"
    TABLE_FILE = "TABLE_FILE"
    UNKNOWN = "UNKNOWN"

class D365JournalLine(BaseModel):
    # D365 columns mapping
    journal_number: str = Field(default="", alias="Journal Number")
    journal_name: str = Field(default="GEN_JOUR", alias="Journal Name")
    line_num: int = Field(default=1, alias="Line Num")
    posting_date: str = Field(default="", alias="Posting Date")
    account_type: int = Field(
        default=0, 
        alias="Account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6",
        description="0=Ledger, 1=Customer, 2=Vendor, 5=Fixed Asset, 6=Bank"
    )
    account_no: str = Field(default="", alias="Account No")
    description: str = Field(default="", alias="Description")
    debit_amount: float = Field(default=0.0, alias="Debit Amount")
    credit_amount: float = Field(default=0.0, alias="Credit Amount")
    currency_code: str = Field(default="AED", alias="Currency Code")
    exchange_rate: float = Field(default=1.0, alias="Exchange Rate")
    offset_account_type: int = Field(
        default=0, 
        alias="Offset account Type - Ledger - 0/ Customer - 1 /Vendor - 2/ Fixed assets - 5/ Bank - 6"
    )
    offset_account: str = Field(default="", alias="Offset account")
    invoice_no: Optional[str] = Field(default=None, alias="Invoice No")
    document_no: Optional[str] = Field(default=None, alias="Document No")
    document_date: Optional[str] = Field(default=None, alias="Document Date")
    due_date: Optional[str] = Field(default=None, alias="Due Date")
    asset_trans_type: Optional[int] = Field(default=None, alias="Asset trans type - Acq - 1 / Depre - 3")
    posting_profile: Optional[str] = Field(default=None, alias="Posting Profile")
    payment_mode: Optional[str] = Field(default=None, alias="Payment Mode")
    payment_reference: Optional[str] = Field(default=None, alias="Payment Reference")
    number_of_voucher: Optional[str] = Field(default=None, alias="Number of Voucher")
    activities: Optional[str] = Field(default=None, alias="Activities")
    country: str = Field(default="UAE", alias="Country")
    departments: Optional[str] = Field(default=None, alias="Departments")
    project_id: Optional[str] = Field(default=None, alias="Project_ID")
    property_id: Optional[str] = Field(default=None, alias="Property_ID")
    unit_id: Optional[str] = Field(default=None, alias="Unit_ID")

    model_config = {"populate_by_name": True}

class ExtractedDocument(BaseModel):
    file_path: str
    document_type: DocumentType
    confidence: float
    reasons: List[str] = []
    lines: List[D365JournalLine] = []
    metadata: Dict[str, Any] = {}

class AIEnrichmentModel(BaseModel):
    document_type: DocumentType
    suggested_account_type: int = 0
    suggested_account_no: str = ""
    description: str = ""
    confidence: float = 100.0
    reasoning: str = ""
