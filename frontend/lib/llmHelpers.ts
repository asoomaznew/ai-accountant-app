// ─────────────────────────────────────────────────────────────────────────────
// lib/llmHelpers.ts
// Shared retry / timeout / JSON-parsing utilities for all LLM-facing services.
//
// Why this file exists:
//   - journalService.ts, warbaJournalService.ts, copilotService.ts, and the
//     other service files all make LLM calls to Ollama / WebLLM.
//   - They were duplicating `try { JSON.parse(raw) } catch { ... }`,
//     hand-rolled retry loops, and ad-hoc `Promise.race` timeouts.
//   - This module centralises those primitives so that all services share
//     the same behaviour (and the same bugs get fixed in one place).
//
// Conventions:
//   - Functions never throw on transient failures; they return a Result
//     object so callers can decide whether to retry, fall back, or surface.
//   - All retryable HTTP statuses match the backend (`backend/modules/
//     llm_gateway.py`) so behaviour is symmetric across the stack.
// ─────────────────────────────────────────────────────────────────────────────

/** HTTP status codes that are worth retrying. Mirrors the backend. */
export const RETRYABLE_HTTP_STATUSES: ReadonlySet<number> = new Set([
    408, // Request Timeout
    425, // Too Early
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
]);

/** Result-style return that distinguishes transport / parse / payload errors. */
export type LlmResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: LlmError };

export interface LlmError {
    kind: 'network' | 'timeout' | 'http' | 'parse' | 'validation' | 'aborted' | 'unknown';
    message: string;
    status?: number;
    cause?: unknown;
    attempts?: number;
}

export interface RetryOptions {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    timeoutMs?: number;
    /** AbortSignal that, when triggered, cancels the in-flight attempt. */
    signal?: AbortSignal;
    /** Predicate: should this error be retried? Defaults to retryable HTTP / network. */
    shouldRetry?: (err: LlmError) => boolean;
    /** Hook called before each retry; useful for logging. */
    onRetry?: (err: LlmError, nextAttempt: number, delayMs: number) => void;
}

const DEFAULTS = {
    maxAttempts: 3,
    baseDelayMs: 800,
    maxDelayMs: 8_000,
    timeoutMs: 60_000,
};

/** Sleep for `ms` milliseconds. Resolves to `false` if the signal aborts. */
export const sleep = (ms: number, signal?: AbortSignal): Promise<boolean> =>
    new Promise((resolve) => {
        if (signal?.aborted) return resolve(false);
        const t = setTimeout(() => resolve(true), ms);
        signal?.addEventListener(
            'abort',
            () => {
                clearTimeout(t);
                resolve(false);
            },
            { once: true }
        );
    });

/** Full-jitter exponential backoff. */
export const computeBackoff = (
    attempt: number,
    baseDelayMs: number,
    maxDelayMs: number
): number => {
    const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    return Math.floor(Math.random() * exp);
};

/**
 * Map a thrown error / Response into a normalised LlmError.
 * Used internally by `withRetry` and exposed for callers that want to
 * classify errors without retrying.
 */
export const classifyError = (err: unknown, status?: number): LlmError => {
    if (err instanceof DOMException && err.name === 'AbortError') {
        return { kind: 'aborted', message: 'Request was aborted', cause: err };
    }
    if (err instanceof TypeError) {
        // fetch() throws TypeError on network failure
        return { kind: 'network', message: err.message || 'Network error', cause: err };
    }
    if (err instanceof Error && err.name === 'TimeoutError') {
        return { kind: 'timeout', message: err.message || 'Request timed out', cause: err };
    }
    if (typeof status === 'number') {
        return {
            kind: 'http',
            message: `HTTP ${status}`,
            status,
            cause: err,
        };
    }
    if (err instanceof SyntaxError) {
        return { kind: 'parse', message: err.message || 'JSON parse error', cause: err };
    }
    return {
        kind: 'unknown',
        message: err instanceof Error ? err.message : String(err),
        cause: err,
    };
};

const defaultShouldRetry = (err: LlmError): boolean => {
    if (err.kind === 'network' || err.kind === 'timeout') return true;
    if (err.kind === 'http' && err.status !== undefined && RETRYABLE_HTTP_STATUSES.has(err.status)) {
        return true;
    }
    return false;
};

/**
 * Wraps an async factory with exponential-backoff retry, per-attempt timeout,
 * and abort-signal support. The factory is re-invoked on each attempt so the
 * caller can create a fresh `fetch` Request / AbortController per try.
 */
export const withRetry = async <T>(
    factory: (signal: AbortSignal) => Promise<T>,
    options: RetryOptions = {}
): Promise<LlmResult<T>> => {
    const opts = { ...DEFAULTS, ...options };
    const shouldRetry = options.shouldRetry ?? defaultShouldRetry;
    let lastErr: LlmError | null = null;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        if (options.signal?.aborted) {
            return { ok: false, error: { kind: 'aborted', message: 'Aborted before start' } };
        }

        // Compose per-attempt timeout with the caller's signal.
        const controller = new AbortController();
        const onCallerAbort = () => controller.abort(options.signal!.reason);
        options.signal?.addEventListener('abort', onCallerAbort, { once: true });
        const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), opts.timeoutMs);

        try {
            const value = await factory(controller.signal);
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', onCallerAbort);
            return { ok: true, value };
        } catch (rawErr) {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', onCallerAbort);
            const err = classifyError(rawErr);
            err.attempts = attempt;
            lastErr = err;

            if (!shouldRetry(err) || attempt >= opts.maxAttempts) {
                return { ok: false, error: err };
            }

            const delay = computeBackoff(attempt, opts.baseDelayMs, opts.maxDelayMs);
            options.onRetry?.(err, attempt + 1, delay);
            const slept = await sleep(delay, options.signal);
            if (!slept) {
                return { ok: false, error: { ...err, kind: 'aborted', message: 'Aborted during backoff' } };
            }
        }
    }

    // Unreachable in practice, but TypeScript wants an explicit return.
    return { ok: false, error: lastErr ?? { kind: 'unknown', message: 'Retry loop exited unexpectedly' } };
};

/**
 * Best-effort JSON parser that strips markdown code fences and trailing
 * commas before throwing. Returns an `LlmResult` so callers can distinguish
 * a parse error from a network error.
 */
export const parseJsonSafe = <T = unknown>(raw: string): LlmResult<T> => {
    if (typeof raw !== 'string' || raw.length === 0) {
        return { ok: false, error: { kind: 'parse', message: 'Empty response' } };
    }
    // Strip ```json ... ``` fences (mirrors cleanJsonOutput in localLlmService).
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const stripped = fence ? fence[1] : raw;
    // If the body still doesn't look like JSON, try to extract the first
    // balanced {...} or [...] block.
    const firstBrace = stripped.indexOf('{');
    const firstBracket = stripped.indexOf('[');
    let candidate = stripped.trim();
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        const lastBrace = stripped.lastIndexOf('}');
        if (lastBrace > firstBrace) candidate = stripped.substring(firstBrace, lastBrace + 1);
    } else if (firstBracket !== -1) {
        const lastBracket = stripped.lastIndexOf(']');
        if (lastBracket > firstBracket) candidate = stripped.substring(firstBracket, lastBracket + 1);
    }
    try {
        return { ok: true, value: JSON.parse(candidate) as T };
    } catch (cause) {
        return {
            ok: false,
            error: {
                kind: 'parse',
                message: 'Response is not valid JSON',
                cause,
            },
        };
    }
};

/**
 * Convenience wrapper: retries + JSON-parse in one call.
 *
 *   const r = await fetchAndParseJson<MyShape>(async (signal) => {
 *     const res = await fetch(url, { signal });
 *     if (!res.ok) throw new Error(`HTTP ${res.status}`);
 *     return res.text();
 *   });
 *   if (!r.ok) { ... }
 */
export const fetchAndParseJson = async <T = unknown>(
    fetcher: (signal: AbortSignal) => Promise<string>,
    retry: RetryOptions = {}
): Promise<LlmResult<T>> => {
    const r = await withRetry(fetcher, retry);
    if (!r.ok) return r;
    return parseJsonSafe<T>(r.value);
};