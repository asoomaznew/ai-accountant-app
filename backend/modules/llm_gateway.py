# ─────────────────────────────────────────────────────────────────────────────
# modules/llm_gateway.py
# Local-only AI Provider Gateway: Ollama (optional) only.
#
# Per project policy: NO cloud providers are used.
# The deterministic Python pipeline is the default for every feature. A local
# Ollama instance, if reachable, may be used purely as an OPTIONAL enhancement.
# If Ollama is unavailable, callers must continue with their deterministic path.
# ─────────────────────────────────────────────────────────────────────────────

import os
import re
import asyncio
import random
import logging
import httpx

logger = logging.getLogger(__name__)

# Ollama (local only)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "haitham-accountant:latest")

# Network timeouts (seconds)
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "120.0"))
OLLAMA_PING_TIMEOUT = float(os.getenv("OLLAMA_PING_TIMEOUT", "3.0"))

# Transient error codes that warrant a retry
_RETRYABLE_HTTP_STATUS = {408, 425, 429, 500, 502, 503, 504}


# ── Retry Helper ────────────────────────────────────────────────────────────

async def _with_retry(coro_factory, *, label: str, max_retries: int = 1):
    """Light retry wrapper. Default 1 attempt: Ollama is optional, so we do not
    waste time retrying when it is down — callers fall back to deterministic."""
    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            return await coro_factory()
        except (httpx.TimeoutException, asyncio.TimeoutError) as exc:
            last_exc = exc
            logger.warning(f"⏱️ {label} timed out (attempt {attempt}/{max_retries}): {exc}")
        except httpx.HTTPStatusError as exc:
            last_exc = exc
            status = exc.response.status_code if exc.response is not None else 0
            if status not in _RETRYABLE_HTTP_STATUS or attempt >= max_retries:
                logger.error(f"❌ {label} HTTP {status} (no retry): {exc}")
                raise
            logger.warning(f"⚠️ {label} HTTP {status} (attempt {attempt}/{max_retries})")
        except (httpx.ConnectError, httpx.NetworkError) as exc:
            last_exc = exc
            logger.warning(f"🔌 {label} network error (attempt {attempt}/{max_retries}): {exc}")
        except Exception as exc:
            last_exc = exc
            logger.warning(f"💥 {label} unexpected error (attempt {attempt}/{max_retries}): {exc}")

        if attempt < max_retries:
            delay = min(8.0, 0.8 * (2 ** (attempt - 1)))
            delay = random.uniform(0, delay)
            await asyncio.sleep(delay)

    assert last_exc is not None
    raise last_exc


# ── Ollama (local only) ─────────────────────────────────────────────────────

async def ping_ollama() -> bool:
    """Return True only if a local Ollama instance is reachable."""
    if not OLLAMA_BASE_URL:
        return False
    try:
        async with httpx.AsyncClient(timeout=OLLAMA_PING_TIMEOUT) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False


async def call_ollama(prompt: str) -> str:
    """Call the local Ollama model. Raises on failure so callers can fall back."""
    async def _do_call() -> str:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are an expert financial accountant AI. Return ONLY valid JSON — no markdown, no explanation.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "options": {"temperature": 0.1, "num_ctx": 4096, "num_predict": 2048},
                    "stream": False,
                    "format": "json",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            raw = data.get("message", {}).get("content", "")
            return _clean_json(raw)

    return await _with_retry(_do_call, label=f"Ollama:{OLLAMA_MODEL}")


# ── Gateway ─────────────────────────────────────────────────────────────────

async def ask_llm(prompt: str) -> str:
    """
    Smart local-only gateway.

    Order: local Ollama (optional) only. There is NO cloud provider.
    If Ollama is unavailable or errors, raise RuntimeError so callers can fall
    back to their deterministic Python parser. (Callers are expected to catch
    this and continue without a model.)
    """
    if await ping_ollama():
        try:
            logger.info(f"🦙 Using Ollama ({OLLAMA_MODEL})...")
            result = await call_ollama(prompt)
            logger.info("✅ Ollama responded successfully.")
            return result
        except Exception as e:
            logger.warning(f"⚠️ Ollama failed: {e}. No cloud fallback configured.")

    raise RuntimeError(
        "No local AI provider available. The deterministic Python pipeline must be used instead."
    )


# ── JSON Cleaning ───────────────────────────────────────────────────────────

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```")


def _clean_json(raw: str) -> str:
    """Strip markdown fences and extract JSON object from LLM response."""
    if not raw:
        return ""

    match = _JSON_FENCE_RE.search(raw)
    if match:
        return match.group(1).strip()

    first = raw.find("{")
    last = raw.rfind("}")
    if first != -1 and last > first:
        return raw[first : last + 1].strip()
    return raw.strip()
