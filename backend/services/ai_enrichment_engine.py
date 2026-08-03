import os
import json
import logging
from models import AIEnrichmentModel, DocumentType, BaseModel

# Optional local Ollama (Instructor/OpenAI-compatible) — never cloud.
try:
    import instructor
    from openai import OpenAI
    HAS_INSTRUCTOR = True
except ImportError:
    HAS_INSTRUCTOR = False

logger = logging.getLogger(__name__)

class AIEnrichmentEngine:
    def __init__(self):
        # Local Ollama (optional enhancement only; never required).
        self.ollama_client = None
        self.use_ollama = os.environ.get("USE_OLLAMA", "false").lower() == "true"
        self.ollama_url = os.environ.get("OLLAMA_HOST", "http://localhost:11434/v1")

        if HAS_INSTRUCTOR and self.use_ollama:
            try:
                self.ollama_client = instructor.from_openai(
                    OpenAI(base_url=self.ollama_url, api_key="ollama"),
                    mode=instructor.Mode.JSON,
                )
            except Exception as e:
                logger.warning(f"Failed to initialize Instructor/Ollama client: {e}")

    def enrich(self, raw_text: str, current_doc_type: str = "UNKNOWN") -> AIEnrichmentModel:
        """
        Enriches raw extracted text. Default = deterministic keyword analysis
        (no model). If USE_OLLAMA=true and a local model is reachable, it may be
        used purely as an optional enhancement; any failure falls back to
        deterministic analysis.
        """
        if not raw_text or not raw_text.strip():
            return self._fallback_enrichment(raw_text, current_doc_type)

        # Optional local Ollama enhancement (never cloud)
        if self.use_ollama and self.ollama_client:
            try:
                logger.info("AI Enrichment: querying local Ollama (optional)...")
                model_name = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")
                enriched_data = self.ollama_client.chat.completions.create(
                    model=model_name,
                    response_model=AIEnrichmentModel,
                    messages=[
                        {"role": "system", "content": "You are an expert AI Accountant specialising in Microsoft Dynamics 365 F&O data entry."},
                        {"role": "user", "content": self._prompt(raw_text, current_doc_type)},
                    ],
                    temperature=0.1,
                )
                logger.info("AI Enrichment: structured JSON parsed from local Ollama.")
                return enriched_data
            except Exception as e:
                logger.warning(f"AI Enrichment: Ollama failed, using deterministic fallback: {e}")

        return self._fallback_enrichment(raw_text, current_doc_type)

    def _prompt(self, raw_text: str, current_doc_type: str) -> str:
        return f"""
        Analyze the following extracted document text from an accounting document.
        Perform the following:
        1. Classify the document type (INVOICE, BANK_STATEMENT, PAYMENT_VOUCHER, CONTRACT, LICENSE, LEASE).
        2. Suggest the best D365 Ledger Account No and account type.
        3. Generate a highly professional accounting description (narrative).

        Raw Document Text:
        ---
        {raw_text[:3000]}
        ---
        """

    def _fallback_enrichment(self, raw_text: str, current_doc_type: str) -> AIEnrichmentModel:
        txt = (raw_text or "").lower()

        doc_type = DocumentType.UNKNOWN
        if "invoice" in txt or "vat" in txt:
            doc_type = DocumentType.INVOICE
        elif "bank statement" in txt or "closing balance" in txt or "account statement" in txt:
            doc_type = DocumentType.BANK_STATEMENT
        elif "payment voucher" in txt:
            doc_type = DocumentType.PAYMENT_VOUCHER
        elif "contract" in txt or "agreement" in txt:
            doc_type = DocumentType.CONTRACT
        elif "lease" in txt or "rent" in txt:
            doc_type = DocumentType.LEASE

        if doc_type == DocumentType.UNKNOWN and current_doc_type != "UNKNOWN":
            try:
                doc_type = DocumentType(current_doc_type)
            except ValueError:
                pass

        suggested_acc = "500100"
        description = "Standard Supplier Payable Invoice"
        reasoning = "Deterministic keyword mapping"

        if "electric" in txt or "dewa" in txt or "sewa" in txt or "electricity" in txt:
            suggested_acc = "500200"
            description = "Electricity and water utility expense"
            reasoning = "Matched utility keyword"
        elif "rent" in txt or "lease" in txt or "real estate" in txt:
            suggested_acc = "500100"
            description = "Office rental lease expense"
            reasoning = "Matched rental/lease keyword"
        elif "bank" in txt or "withdrawal" in txt:
            suggested_acc = "100100"
            description = "Bank account transaction offset"
            reasoning = "Matched bank statement structure"

        return AIEnrichmentModel(
            document_type=doc_type,
            suggested_account_type=0,
            suggested_account_no=suggested_acc,
            description=description,
            confidence=85.0,
            reasoning=reasoning,
        )
