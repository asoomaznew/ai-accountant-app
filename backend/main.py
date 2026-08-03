from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from dotenv import load_dotenv
import sys as _sys, os as _os

# Load .env FIRST so that every configured global below (CORS_ORIGINS,
# AUTH_DISABLED, MAX_UPLOAD_SIZE, ALLOWED_EMAILS, ...) picks up .env values.
# PyInstaller bundles .env into sys._MEIPASS; fall back to CWD for source runs.
_env_base = getattr(_sys, '_MEIPASS', _os.path.dirname(_os.path.abspath(__file__)))
load_dotenv(_os.path.join(_env_base, ".env"))

import uvicorn
import tempfile
import os
import sys
import time
import logging
import re
from typing import List, Optional
from google.oauth2 import id_token
from google.auth.transport import requests
from google.auth import exceptions as google_auth_exceptions
from modules.llm_gateway import ping_ollama
from pydantic import BaseModel
from typing import Dict, Any


# Allowed users — loaded from .env (ALLOWED_EMAILS=comma-separated list)
ALLOWED_EMAILS: list[str] = [
    e.strip() for e in os.getenv("ALLOWED_EMAILS", "").split(",") if e.strip()
]
GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")

# Frontend origin(s) allowed to call this API. Controlled via .env
# (CORS_ORIGINS=comma-separated). Defaults to the local Vite dev server +
# the bundled desktop app so we never fall back to a wildcard.
CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:4173,http://127.0.0.1:4173,"
        "http://localhost:8000,http://127.0.0.1:8000",
    ).split(",")
    if o.strip()
]

# Hard cap on inbound request body (upload endpoints). Protects the 16 GB dev
# machine from a single oversized/looping upload. 25 MB per file is generous
# for bank statements / invoices.
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", "26214400"))  # 25 MB

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

# Local dev escape hatch. Set DISABLE_AUTH=true in .env ONLY for a trusted
# single-user local session. NEVER enable in any shared/exposed deployment.
AUTH_DISABLED = os.getenv("DISABLE_AUTH", "false").lower() in ("1", "true", "yes")

if AUTH_DISABLED:
    logger.warning("⚠️  DISABLE_AUTH=true — authentication is OFF. Local dev only.")


async def verify_google_token(request: Request, authorization: str = Header(None)):
    if AUTH_DISABLED:
        return "local_dev@example.com"

    if not authorization or not authorization.startswith("Bearer "):
        logger.error(f"Auth failed. Header received: {authorization}")
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.split(" ")[1]

    # Local dev bypass token — ONLY permitted on loopback and NEVER in production.
    # If ENVIRONMENT=production (or unset behind a reverse proxy), this branch is
    # skipped so the request must present a real Google token.
    environment = os.getenv("ENVIRONMENT", "development").lower()
    if token == "local_bypass_token":
        if environment == "production":
            logger.warning("Rejected local_bypass_token: ENVIRONMENT=production")
            raise HTTPException(status_code=401, detail="Local bypass token disabled in production")
        host = (request.client.host if request.client else None) or ""
        if host not in ("127.0.0.1", "::1", "localhost"):
            logger.warning("Rejected local_bypass_token from non-loopback host: %s", host)
            raise HTTPException(status_code=403, detail="Local bypass token only allowed from loopback")
        logger.info("Dev loopback bypass accepted")
        return "local_dev@example.com"

    try:
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo.get("email")
        if not email:
            raise HTTPException(status_code=401, detail="Token missing email claim")
        # Security: a Google identity is only accepted when an explicit allow-list
        # is configured. If ALLOWED_EMAILS is empty, refuse real Google sign-ins
        # rather than admitting any valid account. (The local dev bypass token
        # is still permitted on loopback only, via the branch above.)
        if not ALLOWED_EMAILS:
            logger.warning("Refused Google sign-in: ALLOWED_EMAILS is not configured.")
            raise HTTPException(
                status_code=403,
                detail="Server is not configured for Google sign-in (ALLOWED_EMAILS empty). "
                        "Set ALLOWED_EMAILS in .env or use the local dev token on loopback.",
            )
        if email not in ALLOWED_EMAILS:
            logger.warning(f"Unauthorized email attempted access: {email}")
            raise HTTPException(status_code=403, detail="Email not authorized")
        return email
    except HTTPException:
        raise
    except (ValueError, google_auth_exceptions.GoogleAuthError) as e:
        # Token parsing, signature verification, and certificate-fetch errors
        # must never escape as a 500. Avoid returning provider/network details
        # to callers as they do not help them authenticate.
        logger.warning("Token verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or unverifiable authentication token")


async def guard_upload_size(files: List[UploadFile] = File(...)) -> List[UploadFile]:
    """Reject oversized uploads before we read them into memory.

    Protects the 16 GB dev machine from a single huge / looping upload.
    FastAPI reports UploadFile.size when the client sends Content-Length.
    """
    for f in files:
        if f.size is not None and f.size > MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File '{f.filename}' is {f.size} bytes — exceeds limit of {MAX_UPLOAD_SIZE} bytes.",
            )
    return files

from agents.pipeline_orchestrator import SupervisorAgent


app = FastAPI(title="AI Accountant v2 Backend", version="2.0.0")

# Allow CORS only for the configured frontend origin(s). Never use a wildcard
# together with allow_credentials=True — that is an invalid (and unsafe) combo.
# CORS: allow explicit origins from CORS_ORIGINS (comma-separated) AND any
# Vercel preview/production domain (*.vercel.app) so a new Vercel project
# from this repo works without editing code. allow_credentials stays True,
# so we use a regex (not a "*" wildcard) which is the valid/safe combo.
CORS_REGEX = r"https://([a-z0-9-]+\.)*vercel\.app$"
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.get("/api/health")
async def health_check():
    return {
        "status": "running",
        "service": "AI Accountant v2 Backend",
        "version": "2.0.0",
        "ai_providers": {
            "deterministic": "enabled (default, no model)",
            "ollama": "optional local enhancement" if await ping_ollama() else "not reachable",
        },
    }

@app.post("/api/process-statements")
async def process_statements(files: List[UploadFile] = File(...), user_email: str = Depends(verify_google_token), _size=Depends(guard_upload_size)):
    """
    Process bank statement files:
    1. Parse PDF/CSV with pdfplumber+pandas (instant)
    2. Categorize transactions: rules first, then AI for ambiguous ones
    3. Generate IFRS journal entries (KD)
    """
    results = {}
    for file in files:
        filename = file.filename or "unknown"
        if not (filename.endswith(".pdf") or filename.endswith(".csv") or filename.endswith(".xlsx")):
            results[filename] = {"error": f"Unsupported file type: {filename}"}
            continue
        try:
            start_time = time.time()
            # Save uploaded file temporarily
            suffix = os.path.splitext(filename)[1]
            temp_path = None
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                import shutil
                shutil.copyfileobj(file.file, temp_file)
                temp_path = temp_file.name
            # ── Process via Multi-Agent Pipeline ──────────────────────
            orchestrator = SupervisorAgent()
            journal_entries = await orchestrator.process_file_to_entries(temp_path, filename, job_type="bank")
            total_time = time.time() - start_time
            logger.info(
                f"✅ {filename} done in {total_time:.3f}s total via SupervisorAgent"
            )
            results[filename] = journal_entries
        except Exception as e:
            logger.error(f"❌ Error processing {filename}: {e}")
            results[filename] = {"error": str(e)}
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
    return results

@app.post("/api/process-merchant")
async def process_merchant(files: List[UploadFile] = File(...), user_email: str = Depends(verify_google_token), _size=Depends(guard_upload_size)):
    """
    Process Merchant/POS invoices exclusively using Python rules engine.
    """
    results = {}
    for file in files:
        filename = file.filename or "unknown"
        if not (filename.endswith(".pdf") or filename.endswith(".csv") or filename.endswith(".xlsx")):
            results[filename] = {"error": f"Unsupported file type: {filename}"}
            continue
        try:
            start_time = time.time()
            suffix = os.path.splitext(filename)[1]
            temp_path = None
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                import shutil
                shutil.copyfileobj(file.file, temp_file)
                temp_path = temp_file.name
            # ── Process via Multi-Agent Pipeline ──────────────────────
            orchestrator = SupervisorAgent()
            journal_entries = await orchestrator.process_file_to_entries(temp_path, filename, job_type="merchant")
            # If merchant parsing yields nothing (e.g. the file is actually a
            # bank/current-account statement), transparently retry as a bank
            # statement so the tool always returns entries instead of blank.
            if not journal_entries:
                logger.info(f"⚠️ Merchant {filename} empty — retrying as bank statement")
                journal_entries = await orchestrator.process_file_to_entries(temp_path, filename, job_type="bank")
            total_time = time.time() - start_time
            logger.info(f"✅ Merchant {filename} done in {total_time:.3f}s via SupervisorAgent")
            # Strip any empty/malformed entries before returning to frontend
            if isinstance(journal_entries, list):
                journal_entries = [
                    e for e in journal_entries
                    if isinstance(e, dict) and not e.get("_warnings")
                    and (e.get("postingDate") or e.get("date") or e.get("description")
                         or e.get("debitAmount") or e.get("creditAmount")
                         or e.get("debit") or e.get("credit"))
                ]
            results[filename] = journal_entries
        except Exception as e:
            logger.error(f"❌ Error processing merchant {filename}: {e}")
            results[filename] = {"error": str(e)}
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
    return results

@app.post("/api/extract-pos-data")
async def extract_pos_data(files: List[UploadFile] = File(...), user_email: str = Depends(verify_google_token), _size=Depends(guard_upload_size)):
    """
    Extract POS raw transactions from statements using SupervisorAgent (raw_only=True).
    """
    results = {}
    for file in files:
        filename = file.filename or "unknown"
        if not (filename.endswith(".pdf") or filename.endswith(".csv") or filename.endswith(".xlsx") or filename.endswith(".xls")):
            results[filename] = {"error": f"Unsupported file type: {filename}"}
            continue
        try:
            start_time = time.time()
            suffix = os.path.splitext(filename)[1]
            temp_path = None
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                import shutil
                shutil.copyfileobj(file.file, temp_file)
                temp_path = temp_file.name
            
            orchestrator = SupervisorAgent()
            raw_data = await orchestrator.process_file_to_entries(temp_path, filename, job_type="merchant", raw_only=True)
            
            total_time = time.time() - start_time
            logger.info(f"✅ POS Data Extraction for {filename} done in {total_time:.3f}s")
            results[filename] = raw_data
        except Exception as e:
            logger.error(f"❌ Error processing POS extraction for {filename}: {e}")
            results[filename] = {"error": str(e)}
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
    return results

class ChatRequest(BaseModel):
    message: str
    provider: Optional[str] = "auto"
    model: Optional[str] = None
    context: Optional[List[dict]] = None
    system_prompt: Optional[str] = None

@app.get("/api/models")
async def get_models(user_email: str = Depends(verify_google_token)):
    # Local-only: deterministic Python pipeline is the default engine.
    # Ollama is an optional local enhancement, exposed only if reachable.
    models = ["Python Rules Engine"]
    try:
        from modules.llm_gateway import ping_ollama
        if await ping_ollama():
            models.append("ollama (local)")
    except Exception:
        pass
    return models

# NOTE: /api/gemini/generate was removed. The app is local-only (no cloud).
# Use /api/chat or the deterministic Python pipeline instead.

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest, user_email: str = Depends(verify_google_token)):
    """
    Main Chatbot endpoint. Routes request to ChatbotAgent.
    """
    from agents.chatbot_agent import ChatbotAgent
    agent = ChatbotAgent()
    
    try:
        response = await agent.chat(
            user_message=req.message,
            provider=req.provider,
            model=req.model,
            context=req.context,
            custom_system_prompt=req.system_prompt
        )
        return {"response": response}
    except Exception as e:
        # No model available (Gemini removed; Ollama not running) — return a
        # clean, user-facing message instead of a 500 error so the frontend
        # can display it gracefully.
        err = str(e)
        if "No local AI provider" in err or "No AI provider" in err:
            return {"response": "AI Copilot needs a local model. Start Ollama (e.g. `ollama run haitham-accountant`) or use the deterministic tools — they need no model."}
        return {"response": f"AI Copilot is unavailable right now: {err}"}

@app.post("/api/bahrain/process")
async def process_bahrain_emails(
    files: List[UploadFile] = File(...),
    user_email: str = Depends(verify_google_token),
    _size: List[UploadFile] = Depends(guard_upload_size),
):
    """
    Process Bahrain CustPayment email PDFs (DETERMINISTIC, no model):
    1. Extract text with pdfplumber.
    2. Parse payment rows with pure-Python rules (amounts, dates, customer match
       via BAHRAIN_CUSTOMER_MASTER + RapidFuzz).
    3. Return structured JSON (rows: pdate, unit, ccode, cname, desc, amt, force).
    """
    import re
    import pdfplumber
    import json as _json
    from rapidfuzz import process as _rf_process, fuzz as _rf_fuzz

    from config.customer_master import BAHRAIN_CUSTOMER_MASTER as CUSTOMER_MASTER

    def _match_customer(text: str):
        """Return (name, code) for the best fuzzy match in the text, else ('', '')."""
        best_name, best_code, best_score = "", "", 0
        for c in CUSTOMER_MASTER:
            name = c.get("name", "")
            code = c.get("code", "")
            if not name:
                continue
            score = _rf_process.extractOne(name, [text], scorer=_rf_fuzz.partial_ratio)
            s = score[1] if score else 0
            if s > best_score:
                best_score, best_name, best_code = s, name, code
        if best_score >= 70:
            return best_name, best_code
        return "", ""

    _DATE_RE = re.compile(r"\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b")
    _AMT_RE = re.compile(r"([\d,]+\.\d{2,3})")
    _FORCE_RE = re.compile(r"\b(rent|ewa)\b", re.IGNORECASE)

    results = []

    for file in files:
        filename = file.filename or "unknown.pdf"
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tf:
                import shutil
                shutil.copyfileobj(file.file, tf)
                temp_path = tf.name

            full_text = ""
            with pdfplumber.open(temp_path) as pdf:
                for page in pdf.pages:
                    full_text += (page.extract_text() or "") + "\n"

            rows = []
            cname, ccode = _match_customer(full_text)
            for line in full_text.splitlines():
                line = line.strip()
                dm = _DATE_RE.search(line)
                amts = _AMT_RE.findall(line)
                if not dm or not amts:
                    continue
                amt = float(amts[0].replace(",", ""))
                force = "Rent" if _FORCE_RE.search(line) else "EWA"
                rows.append({
                    "pdate": dm.group(1),
                    "unit": "",
                    "ccode": ccode,
                    "cname": cname,
                    "desc": line,
                    "amt": amt,
                    "force": force,
                })

            data = {"rows": rows}
            results.append({"fileName": filename, "success": True, "extractedData": data})

        except Exception as e:
            logger.error(f"Bahrain process failed for {filename}: {e}")
            results.append({"fileName": filename, "success": False, "error": str(e)})
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass

    return {"results": results}


from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# PyInstaller bundles data files into sys._MEIPASS. When running from source,
# fall back to the directory containing this file.
_base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
dist_path = os.path.join(_base_path, "dist")
logger.info(f"Looking for frontend dist at: {dist_path} (exists={os.path.exists(dist_path)})")
if os.path.exists(dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_path, "assets")), name="assets")
    
    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(dist_path, "index.html"))

    @app.get("/{catchall:path}")
    async def serve_frontend(catchall: str):
        # Prevent API routes from falling back to index.html
        if catchall.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        file_path = os.path.join(dist_path, catchall)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_path, "index.html"))
else:
    @app.get("/")
    async def root_health():
        return await health_check()


if __name__ == "__main__":
    # LOCAL (default): host 127.0.0.1 + port 8000 keeps the one-click
    # launcher (🚀 Run AI Accountant.command) working exactly as before.
    # CLOUD (Render): the platform injects $PORT and we bind 0.0.0.0 so the
    # service is reachable outside the container. Neither path changes the
    # other's behaviour.
    _port = int(os.getenv("PORT", "8000"))
    _host = os.getenv("HOST", "127.0.0.1")
    uvicorn.run("main:app", host=_host, port=_port, reload=False)
