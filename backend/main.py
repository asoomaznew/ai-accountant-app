from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import uvicorn
import tempfile
import os
import time
import logging
import re
from typing import List, Optional
from google.oauth2 import id_token
from google.auth.transport import requests
from pydantic import BaseModel
from typing import Dict, Any

class GenerateContentRequest(BaseModel):
    model: str
    contents: str
    config: Optional[Dict[str, Any]] = None

# Allowed users — loaded from .env (ALLOWED_EMAILS=comma-separated list)
ALLOWED_EMAILS: list[str] = [
    e.strip() for e in os.getenv("ALLOWED_EMAILS", "").split(",") if e.strip()
]
GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

async def verify_google_token(request: Request, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        logger.error(f"Auth failed. Header received: {authorization}")
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    
    token = authorization.split(" ")[1]
    
    # Bypass for Local Development (explicit null/undefined/local_bypass_token)
    if token in ["null", "undefined", "", "local_bypass_token"]:
        logger.info("Local dev token bypass used.")
        return "local_dev@example.com"
    try:
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo.get("email")
        if email not in ALLOWED_EMAILS:
            logger.warning(f"Unauthorized email attempted access: {email}")
            raise HTTPException(status_code=403, detail="Email not authorized")
        return email
    except ValueError as e:
        logger.error(f"Token verification failed: {e}")
        # Fallback for local development if client is localhost
        if request.client and request.client.host in ["127.0.0.1", "::1", "localhost"]:
            logger.warning("Localhost detected. Bypassing invalid token for local development.")
            return "local_dev@example.com"
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

from agents.pipeline_orchestrator import SupervisorAgent

# ── Load .env ───────────────────────────────────────────────────────────────
if os.path.exists(".env"):
    load_dotenv(".env")
# Map GEMINI_API_KEY from .env to what the gateway expects
if os.getenv("GEMINI_API_KEY") and not os.getenv("GEMINI_API_KEY_SET"):
    os.environ["GEMINI_API_KEY"] = os.getenv("GEMINI_API_KEY", "")

app = FastAPI(title="AI Accountant v2 Backend", version="2.0.0")

# Allow CORS for local React app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def health_check():
    return {
        "status": "running",
        "service": "AI Accountant v2 Backend",
        "version": "2.0.0",
        "ai_providers": {
            "ollama": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            "gemini": "configured" if os.getenv("GEMINI_API_KEY") else "not configured",
        },
    }

@app.post("/api/process-statements")
async def process_statements(files: List[UploadFile] = File(...), user_email: str = Depends(verify_google_token)):
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
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                content = await file.read()
                temp_file.write(content)
                temp_path = temp_file.name
            # ── Process via Multi-Agent Pipeline ──────────────────────
            orchestrator = SupervisorAgent()
            journal_entries = await orchestrator.process_file_to_entries(temp_path, filename, job_type="bank")
            total_time = time.time() - start_time
            logger.info(
                f"✅ {filename} done in {total_time:.3f}s total via SupervisorAgent"
            )
            results[filename] = journal_entries
            # Clean up
            os.unlink(temp_path)
        except Exception as e:
            logger.error(f"❌ Error processing {filename}: {e}")
            results[filename] = {"error": str(e)}
    return results

@app.post("/api/process-merchant")
async def process_merchant(files: List[UploadFile] = File(...), user_email: str = Depends(verify_google_token)):
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
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                content = await file.read()
                temp_file.write(content)
                temp_path = temp_file.name
            # ── Process via Multi-Agent Pipeline ──────────────────────
            orchestrator = SupervisorAgent()
            journal_entries = await orchestrator.process_file_to_entries(temp_path, filename, job_type="merchant")
            total_time = time.time() - start_time
            logger.info(f"✅ Merchant {filename} done in {total_time:.3f}s via SupervisorAgent")
            results[filename] = journal_entries
            os.unlink(temp_path)
        except Exception as e:
            logger.error(f"❌ Error processing merchant {filename}: {e}")
            results[filename] = {"error": str(e)}
    return results

@app.post("/api/extract-pos-data")
async def extract_pos_data(files: List[UploadFile] = File(...), user_email: str = Depends(verify_google_token)):
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
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                content = await file.read()
                temp_file.write(content)
                temp_path = temp_file.name
            
            orchestrator = SupervisorAgent()
            raw_data = await orchestrator.process_file_to_entries(temp_path, filename, job_type="merchant", raw_only=True)
            
            total_time = time.time() - start_time
            logger.info(f"✅ POS Data Extraction for {filename} done in {total_time:.3f}s")
            results[filename] = raw_data
            os.unlink(temp_path)
        except Exception as e:
            logger.error(f"❌ Error processing POS extraction for {filename}: {e}")
            results[filename] = {"error": str(e)}
    return results

class ChatRequest(BaseModel):
    message: str
    provider: Optional[str] = "auto"
    model: Optional[str] = None
    context: Optional[List[dict]] = None
    system_prompt: Optional[str] = None

@app.get("/api/models")
async def get_models(user_email: str = Depends(verify_google_token)):
    return ["gemini-2.5-flash", "qwen3:8b", "Python Rules Engine"]

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
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/gemini/generate")
async def gemini_proxy(req: GenerateContentRequest, user_email: str = Depends(verify_google_token)):
    from google import genai
    from google.genai import types
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Google Gemini API key is not configured on the server.")
        
    client = genai.Client(api_key=api_key)
    
    try:
        generate_kwargs = {}
        if req.config:
            gen_config = types.GenerateContentConfig()
            if "responseMimeType" in req.config:
                gen_config.response_mime_type = req.config["responseMimeType"]
            if "responseSchema" in req.config:
                gen_config.response_schema = req.config["responseSchema"]
            if "temperature" in req.config:
                gen_config.temperature = req.config["temperature"]
            generate_kwargs["config"] = gen_config

        response = client.models.generate_content(
            model=req.model,
            contents=req.contents,
            **generate_kwargs
        )
        return {"text": response.text}
    except Exception as e:
        logger.error(f"Gemini Proxy Error: {e}")
        # Pass up 429/403 details if possible
        if hasattr(e, "code") and e.code:
            raise HTTPException(status_code=e.code, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/bahrain/process")
async def process_bahrain_emails(
    files: List[UploadFile] = File(...),
    user_email: str = Depends(verify_google_token),
):
    """
    Process Bahrain CustPayment email PDFs:
    1. Extract text with pdfplumber
    2. Send to Gemini 3.5 Flash with CUSTOMER_MASTER mapping
    3. Return structured JSON (rows: pdate, unit, ccode, cname, desc, amt, force)
    """
    from google import genai
    from google.genai import types
    import pdfplumber
    import json as _json

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Gemini API key not configured.")

    # Bahrain Customer Master (mirrored from frontend service)
    CUSTOMER_MASTER = {
        "BHW1-C-12": {"code": "24-000033", "name": "Savon Company WLL"},
        "BHW1-C-25": {"code": "24-000032", "name": "Crown Gold W.L.L"},
        "BHW1-C-21": {"code": "24-000035", "name": "Baraka Sweets Factory"},
        "BHW1-C-9":  {"code": "24-000053", "name": "WAED INDUSTRIAL INNOVATION COMPANY W.L.L"},
    }

    client = genai.Client(api_key=api_key)
    results = []

    for file in files:
        filename = file.filename or "unknown.pdf"
        try:
            content = await file.read()
            # Save temp
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tf:
                tf.write(content)
                temp_path = tf.name

            # Extract text
            full_text = ""
            with pdfplumber.open(temp_path) as pdf:
                for page in pdf.pages:
                    full_text += (page.extract_text() or "") + "\n"

            os.unlink(temp_path)

            prompt = f"""You are an expert at extracting payment advice information from emails.
Analyze the email text and extract the payment breakdown.
Email Text: {full_text}
Available Customer Master: {_json.dumps(CUSTOMER_MASTER)}
Return ONLY a valid JSON object with this schema:
{{"rows":[{{"pdate":"DD-MM-YYYY","unit":"KEY","ccode":"CODE","cname":"NAME","desc":"DESCRIPTION","amt":NUMBER,"force":"Rent|EWA"}}]}}
"""
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )
            data = _json.loads(response.text)
            results.append({"fileName": filename, "success": True, "extractedData": data})

        except Exception as e:
            logger.error(f"Bahrain process failed for {filename}: {e}")
            results.append({"fileName": filename, "success": False, "error": str(e)})

    return {"results": results}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
