// ─────────────────────────────────────────────────────────────────────────────
// services/localLlmService.ts
// AI provider gateway: Gemini Cloud | Ollama Local | WebLLM (WebGPU)
// ─────────────────────────────────────────────────────────────────────────────

import { wrap, proxy, type Remote } from 'comlink';
import type { aiWorker as AiWorkerType } from '../workers/ai.worker';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LLMProvider = 'gemini' | 'ollama' | 'webllm' | 'none';

export interface LLMConfig {
  provider: LLMProvider;
  ollamaBaseUrl: string;   // e.g. http://localhost:11434
  ollamaModel: string;     // e.g. qwen3:8b
  webllmModelId: string;   // HuggingFace MLC model ID
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

export interface LLMResult {
  text: string;
  provider: LLMProvider;
}

export type WebLLMProgressCallback = (p: { text: string; progress: number }) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Config persistence
// ─────────────────────────────────────────────────────────────────────────────

export interface WebLLMModelOption {
  id: string;
  name: string;
  sizeStr: string;
  sizeBytes: number;
  description: string;
}

export const WEBLLM_MODELS: WebLLMModelOption[] = [
  {
    id: 'Qwen3-8B-q4f16_1-MLC',
    name: 'Qwen 3 8B (Local Directory)',
    sizeStr: '5.2 GB',
    sizeBytes: 5.22 * 1024 * 1024 * 1024,
    description: 'Latest Qwen 3 model. High performance for text analysis and financial tasks.',
  },
  {
    id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 7B Instruct (Local Directory)',
    sizeStr: '4.7 GB',
    sizeBytes: 4.68 * 1024 * 1024 * 1024,
    description: 'High-quality multilingual model. Excellent accuracy for invoice data extraction.',
  },
  {
    id: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 Coder 7B Instruct (Local Directory)',
    sizeStr: '4.7 GB',
    sizeBytes: 4.68 * 1024 * 1024 * 1024,
    description: 'Specialized model for code generation and parsing structured tables.',
  },
  {
    id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
    name: 'Mistral 7B Instruct (Local Directory)',
    sizeStr: '4.4 GB',
    sizeBytes: 4.37 * 1024 * 1024 * 1024,
    description: 'High performance open-source model. Optimized for text generation and translation.',
  },
  {
    id: 'gemma-2-9b-it-q4f16_1-MLC',
    name: 'Gemma 4 / Gemma 2 9B IT (Local Directory)',
    sizeStr: '9.6 GB',
    sizeBytes: 9.61 * 1024 * 1024 * 1024,
    description: 'Google Gemma model with high parameter count. Deep reasoning capabilities.',
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 3B Instruct',
    sizeStr: '2.0 GB',
    sizeBytes: 2.0 * 1024 * 1024 * 1024,
    description: 'Balanced speed and accuracy. Great for systems with less VRAM.',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 1.5B Instruct',
    sizeStr: '1.2 GB',
    sizeBytes: 1.2 * 1024 * 1024 * 1024,
    description: 'Fast and lightweight model. Lowest resources and download size.',
  },
  {
    id: 'Llama-3-8B-Instruct-q4f16_1-MLC',
    name: 'Llama 3 8B Instruct',
    sizeStr: '4.7 GB',
    sizeBytes: 4.7 * 1024 * 1024 * 1024,
    description: 'Meta\'s powerful open-source model. Excellent reasoning and instruction following.',
  },
  {
    id: 'Phi-3-mini-128k-instruct-q4f16_1-MLC',
    name: 'Phi 3 Mini Instruct',
    sizeStr: '2.2 GB',
    sizeBytes: 2.2 * 1024 * 1024 * 1024,
    description: 'Microsoft\'s lightweight model. Highly optimized for reasoning tasks.',
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    name: 'Gemma 2 2B IT',
    sizeStr: '1.6 GB',
    sizeBytes: 1.6 * 1024 * 1024 * 1024,
    description: 'Google\'s lightweight instruction-tuned model. Fast and capable.',
  }
];

const DEFAULTS: LLMConfig = {
  provider: 'gemini',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'haitham-accountant:latest',
  webllmModelId: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
};

export const getLLMConfig = (): LLMConfig => {
  try {
    const savedWebLlmId = localStorage.getItem('llm_webllm_id');
    const webllmModelId = (!savedWebLlmId || savedWebLlmId.includes('Qwen3') || savedWebLlmId.startsWith('HF://'))
      ? DEFAULTS.webllmModelId
      : savedWebLlmId;
    return {
      provider: (localStorage.getItem('llm_provider') ?? DEFAULTS.provider) as LLMProvider,
      ollamaBaseUrl: localStorage.getItem('llm_ollama_url') ?? DEFAULTS.ollamaBaseUrl,
      ollamaModel: localStorage.getItem('llm_ollama_model') ?? DEFAULTS.ollamaModel,
      webllmModelId,
    };
  } catch {
    return DEFAULTS;
  }
};

export const setLLMConfig = (patch: Partial<LLMConfig>): void => {
  try {
    if (patch.provider !== undefined) localStorage.setItem('llm_provider', patch.provider);
    if (patch.ollamaBaseUrl !== undefined) localStorage.setItem('llm_ollama_url', patch.ollamaBaseUrl);
    if (patch.ollamaModel !== undefined) localStorage.setItem('llm_ollama_model', patch.ollamaModel);
    if (patch.webllmModelId !== undefined) localStorage.setItem('llm_webllm_id', patch.webllmModelId);
  } catch { /* no-op */ }
};

// ─────────────────────────────────────────────────────────────────────────────
// Ollama API helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Ping Ollama and return true if it's running */
export const pingOllama = async (baseUrl: string): Promise<boolean> => {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
};

/** Fetch list of models installed in Ollama */
export const fetchOllamaModels = async (baseUrl: string): Promise<OllamaModel[]> => {
  const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json() as { models: OllamaModel[] };
  return data.models ?? [];
};

/**
 * Recursively converts a Google GenAI schema (using uppercase types like OBJECT, STRING, ARRAY, etc.)
 * to standard lowercase types expected by standard JSON schema engines (like WebLLM / Ollama).
 */
function convertToStandardJsonSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const result = Array.isArray(schema) ? [...schema] : { ...schema };

  if (typeof result.type === 'string') {
    const typeLower = result.type.toLowerCase();
    if (typeLower === 'string') result.type = 'string';
    else if (typeLower === 'number') result.type = 'number';
    else if (typeLower === 'integer') result.type = 'integer';
    else if (typeLower === 'boolean') result.type = 'boolean';
    else if (typeLower === 'array') result.type = 'array';
    else if (typeLower === 'object') result.type = 'object';
  }

  if (result.properties && typeof result.properties === 'object') {
    const newProps: any = {};
    for (const key of Object.keys(result.properties)) {
      newProps[key] = convertToStandardJsonSchema(result.properties[key]);
    }
    result.properties = newProps;
  }

  if (result.items) {
    result.items = convertToStandardJsonSchema(result.items);
  }

  return result;
}

const callOllama = async (
  prompt: string,
  schema?: unknown,
  config?: LLMConfig
): Promise<LLMResult> => {
  const cfg = config ?? getLLMConfig();
  const baseUrl = cfg.ollamaBaseUrl.replace(/\/$/, '');
  const model = cfg.ollamaModel;

  if (!model) throw new Error('No Ollama model selected. Go to AI Settings and choose a model.');

  let systemMsg = 'You are an expert AI financial data extraction assistant. Be concise and accurate.';
  let formatOption: any = undefined;

  if (schema) {
    const standardSchema = convertToStandardJsonSchema(schema);
    systemMsg += `\n\nReturn ONLY valid JSON — no markdown, no explanation. Match exactly:\n${JSON.stringify(standardSchema, null, 2)}`;
    formatOption = 'json';
  }

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt },
      ],
      options: {
        temperature: 0.1,
        num_ctx: 8000,
        num_predict: 8000
      },
      stream: false,
      format: formatOption,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  const data = await res.json() as { message: { content: string } };
  const raw = data.message?.content ?? '';
  return { text: cleanJsonOutput(raw), provider: 'ollama' };
};

// ─────────────────────────────────────────────────────────────────────────────
// WebLLM — Web Worker singleton
// ─────────────────────────────────────────────────────────────────────────────

let workerInstance: Worker | null = null;
let workerAPI: Remote<typeof AiWorkerType> | null = null;

const getWorkerAPI = (): Remote<typeof AiWorkerType> => {
  if (!workerAPI && typeof window !== 'undefined') {
    workerInstance = new Worker(
      new URL('../workers/ai.worker', import.meta.url),
      { type: 'module' }
    );
    workerAPI = wrap<typeof AiWorkerType>(workerInstance);
  }
  if (!workerAPI) throw new Error('Web Worker unavailable');
  return workerAPI;
};

let webllmReady = false;
let webllmLoading = false;
let webllmPromise: Promise<void> | null = null;
let loadedModelId: string | null = null;

/**
 * Initialize WebLLM. Safe to call concurrently — duplicate callers will
 * receive the same in-flight promise rather than spawning extra workers.
 *
 * Throws on failure and resets internal state so a retry is possible.
 */
export const initWebLLM = async (onProgress?: WebLLMProgressCallback): Promise<void> => {
  const cfg = getLLMConfig();
  if (webllmReady && loadedModelId === cfg.webllmModelId) return;
  // If an init is already running, return the same promise to all callers.
  // (Belt-and-suspenders: check `webllmLoading` first so we never return undefined.)
  if (webllmLoading) {
    if (webllmPromise) return webllmPromise;
    // Loading flag is stale — fall through and start a fresh attempt.
  }

  webllmLoading = true;
  const initPromise = (async () => {
    try {
      // getWorkerAPI() must be called *inside* the IIFE so that any synchronous
      // throw (e.g. "Web Worker unavailable") is caught and translated into a
      // rejected promise that subsequent callers can await.
      const api = getWorkerAPI();
      await api.initWebLLM(cfg.webllmModelId, onProgress ? proxy(onProgress) : undefined);
      webllmReady = true;
      loadedModelId = cfg.webllmModelId;
    } catch (e) {
      webllmReady = false;
      // Reset loadedModelId so the user can retry with the same model.
      loadedModelId = null;
      throw e;
    } finally {
      webllmLoading = false;
      webllmPromise = null;
    }
  })();
  // Assign before any await so concurrent callers can see the in-flight promise.
  webllmPromise = initPromise;
  return initPromise;
};

export const isWebLLMReady = (): boolean => {
  const cfg = getLLMConfig();
  return webllmReady && loadedModelId === cfg.webllmModelId;
};

export const getActiveWebLLMModel = (): string | null => {
  return loadedModelId;
};

/**
 * Release all WebLLM resources: the model cache, the worker, and the cached
 * Comlink proxy. After calling this, the next `initWebLLM()` call will
 * re-create everything from scratch. Safe to call multiple times.
 */
export const disposeWebLLM = async (): Promise<void> => {
  webllmLoading = false;
  webllmPromise = null;
  webllmReady = false;
  loadedModelId = null;
  if (workerAPI) {
    try {
      await (workerAPI as unknown as { reset?: () => Promise<void> }).reset?.();
    } catch {
      /* best-effort cleanup */
    }
  }
  if (workerInstance) {
    try { workerInstance.terminate(); } catch { /* ignore */ }
    workerInstance = null;
  }
  workerAPI = null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main gateway — called by all service files
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called by geminiService.ts when provider !== 'gemini'.
 * Returns LLMResult for Ollama or WebLLM.
 * Returns null when provider is 'gemini' (caller handles it).
 */
export const callLocalLLM = async (
  prompt: string,
  schema: unknown,
  _modelName: string,
  _baseUrl: string,
  onProgress?: WebLLMProgressCallback
): Promise<LLMResult> => {
  const cfg = getLLMConfig();

  if (cfg.provider === 'ollama') {
    return callOllama(prompt, schema, cfg);
  }

  if (cfg.provider === 'webllm') {
    await initWebLLM(onProgress);
    const standardSchema = schema ? convertToStandardJsonSchema(schema) : undefined;
    const schemaStr = standardSchema ? JSON.stringify(standardSchema, null, 2) : undefined;
    const raw = await getWorkerAPI().generate(prompt, schemaStr);
    return { text: cleanJsonOutput(raw), provider: 'webllm' };
  }

  if (cfg.provider === 'none') {
    // Signal to callers that the Python Rules Engine does not support this local LLM task
    throw new Error("__RULES_ENGINE_UNSUPPORTED__");
  }

  throw new Error(`Unknown provider: ${cfg.provider}`);
};

/**
 * Stream WebLLM generation
 */
export const streamWebLLM = async (
  prompt: string,
  history: { role: 'user' | 'model'; content: string }[],
  systemMsg: string,
  onChunk: (chunk: string) => void
): Promise<void> => {
  await initWebLLM();
  const api = getWorkerAPI();
  await api.generateStream(prompt, history, systemMsg, proxy(onChunk));
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cleanJsonOutput(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) return fence[1].trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) return raw.substring(first, last + 1).trim();
  return raw.trim();
}
