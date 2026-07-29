import os
import json
from models import AIEnrichmentModel, DocumentType, BaseModel

# Try to import instructor and openai for Ollama / Qwen3 support
try:
    import instructor
    from openai import OpenAI
    HAS_INSTRUCTOR = True
except ImportError:
    HAS_INSTRUCTOR = False

try:
    from google import genai
    from google.genai import types
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False

class AIEnrichmentEngine:
    def __init__(self):
        # Gemini setup
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("API_KEY")
        self.gemini_client = None
        if HAS_GEMINI and self.gemini_api_key:
            try:
                self.gemini_client = genai.Client(api_key=self.gemini_api_key)
                print("[+] AI Enrichment: Gemini Client loaded successfully.")
            except Exception as e:
                print(f"Warning: Failed to initialize Gemini Client: {e}")

        # Ollama / Qwen3 setup via Instructor
        self.ollama_client = None
        self.use_ollama = os.environ.get("USE_OLLAMA", "false").lower() == "true"
        self.ollama_url = os.environ.get("OLLAMA_HOST", "http://localhost:11434/v1")
        
        if HAS_INSTRUCTOR and (self.use_ollama or not self.gemini_client):
            try:
                # Patch OpenAI client with instructor for Ollama/Qwen3 structured JSON outputs
                self.ollama_client = instructor.from_openai(
                    OpenAI(
                        base_url=self.ollama_url,
                        api_key="ollama"  # placeholder for local service
                    ),
                    mode=instructor.Mode.JSON
                )
                print(f"[+] AI Enrichment: Instructor patched Ollama client loaded on {self.ollama_url}")
            except Exception as e:
                print(f"Warning: Failed to initialize Instructor/Ollama client: {e}")

    def enrich(self, raw_text: str, current_doc_type: str = "UNKNOWN") -> AIEnrichmentModel:
        """
        Enriches raw extracted text using Qwen3 (via Ollama/Instructor) or Gemini.
        Returns a structured AIEnrichmentModel.
        """
        if not raw_text or not raw_text.strip():
            return self._fallback_enrichment(raw_text, current_doc_type)

        prompt = f"""
        Analyze the following extracted document text from an accounting document.
        Perform the following:
        1. Classify the document type (INVOICE, BANK_STATEMENT, PAYMENT_VOUCHER, CONTRACT, LICENSE, LEASE).
        2. Suggest the best D365 Ledger Account No (e.g. '500100' for office rent, '500200' for electricity, '200500' for VAT, '100100' for bank, etc.) and suggest the account type (0=Ledger, 1=Customer, 2=Vendor, 6=Bank).
        3. Generate a highly professional accounting description (narrative) summarizing the document contents.
        
        Raw Document Text:
        ---
        {raw_text[:3000]}
        ---
        """

        # 1. Try Ollama / Qwen3 with Instructor if configured as primary
        if self.use_ollama and self.ollama_client:
            try:
                print("  |-> Querying Ollama (Qwen3) via Instructor Pydantic mode...")
                model_name = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b") # Qwen 2.5 or 3
                enriched_data = self.ollama_client.chat.completions.create(
                    model=model_name,
                    response_model=AIEnrichmentModel,
                    messages=[
                        {"role": "system", "content": "You are an expert AI Accountant specialising in Microsoft Dynamics 365 F&O data entry."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1
                )
                print(f"  [✓] Success: Structured JSON parsed from Qwen3 model.")
                return enriched_data
            except Exception as e:
                print(f"  [X] Ollama/Instructor failed: {e}. Trying Gemini fallback...")

        # 2. Try Gemini with modern Native Structured Outputs
        if self.gemini_client:
            try:
                print("  |-> Querying Gemini-2.5-flash with structured schema...")
                response = self.gemini_client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=AIEnrichmentModel,
                        temperature=0.1
                    )
                )
                data = json.loads(response.text)
                print(f"  [✓] Success: Structured JSON parsed from Gemini-2.5.")
                return AIEnrichmentModel(**data)
            except Exception as e:
                print(f"  [X] Gemini failed: {e}. Falling back to deterministic analysis.")

        # 3. Fallback to Instructor with OpenAI/Local if we have a client but USE_OLLAMA wasn't explicit
        if self.ollama_client:
            try:
                print("  |-> Falling back to local Ollama (Qwen3) Instructor model...")
                enriched_data = self.ollama_client.chat.completions.create(
                    model="qwen2.5:7b",
                    response_model=AIEnrichmentModel,
                    messages=[
                        {"role": "system", "content": "You are a professional D365 data entry AI."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1
                )
                return enriched_data
            except Exception:
                pass

        # 4. Deterministic keyword parsing fallback
        return self._fallback_enrichment(raw_text, current_doc_type)

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

        # Smart defaults based on keyword matches
        suggested_acc = "500100"  # default office expense
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
            suggested_account_type=0,  # Ledger default
            suggested_account_no=suggested_acc,
            description=description,
            confidence=85.0,
            reasoning=reasoning
        )
