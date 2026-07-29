import os, json, re
from typing import Optional
import ollama
from models import ExtractedDocument, D365JournalLine
from config.settings import MODEL_NAME, OLLAMA_OPENAI_BASE_URL
from services.logger import log

try:
    import instructor
    from openai import OpenAI
    INSTRUCTOR_AVAILABLE = True
except Exception:
    INSTRUCTOR_AVAILABLE = False

class AiEnrichmentEngine:
    def enrich(self, extracted: ExtractedDocument, base_entry: D365JournalLine) -> D365JournalLine:
        improved = self._try_instructor(extracted, base_entry)
        if improved:
            improved.notes = (improved.notes + " | AI enriched with Instructor/Pydantic").strip()
            return improved
        improved = self._try_ollama_json(extracted, base_entry)
        if improved:
            improved.notes = (improved.notes + " | AI enriched with Pydantic JSON fallback").strip()
            return improved
        return base_entry

    def _prompt(self, extracted: ExtractedDocument, base_entry: D365JournalLine) -> str:
        return f"""
You are a senior accountant using Microsoft Dynamics 365 Finance & Operations.
Improve the D365 journal line only if the extracted data supports it.
Do not invent unsupported values. Return one validated D365JournalLine JSON.
Extracted document:
{extracted.model_dump_json(indent=2)}
Base journal:
{base_entry.model_dump_json(indent=2)}
"""

    def _try_instructor(self, extracted: ExtractedDocument, base_entry: D365JournalLine) -> Optional[D365JournalLine]:
        if not INSTRUCTOR_AVAILABLE:
            return None
        try:
            client = instructor.from_openai(OpenAI(base_url=OLLAMA_OPENAI_BASE_URL, api_key="ollama"), mode=instructor.Mode.JSON)
            return client.chat.completions.create(
                model=MODEL_NAME,
                response_model=D365JournalLine,
                messages=[{"role": "system", "content": "Return valid D365JournalLine JSON only."}, {"role": "user", "content": self._prompt(extracted, base_entry)}],
                temperature=0.1,
            )
        except Exception as e:
            log(f"Instructor enrichment failed: {e}", "WARNING")
            return None

    def _try_ollama_json(self, extracted: ExtractedDocument, base_entry: D365JournalLine) -> Optional[D365JournalLine]:
        try:
            r = ollama.chat(
                model=MODEL_NAME,
                messages=[{"role": "system", "content": "Return JSON only."}, {"role": "user", "content": self._prompt(extracted, base_entry)}],
                options={"temperature": 0.1, "num_ctx": 4096},
            )
            text = r.get("message", {}).get("content", "")
            try:
                raw = json.loads(text)
            except Exception:
                m = re.search(r"\{.*\}", text, re.S)
                raw = json.loads(m.group(0)) if m else {}
            return D365JournalLine.model_validate(raw)
        except Exception as e:
            log(f"Ollama enrichment failed: {e}", "WARNING")
            return None
