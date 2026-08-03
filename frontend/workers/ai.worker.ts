// ─────────────────────────────────────────────────────────────────────────────
// workers/ai.worker.ts
// Runs in a Web Worker — isolated from the main thread
// Handles WebLLM (Qwen3 8B via WebGPU) and Transformers.js classification
// ─────────────────────────────────────────────────────────────────────────────

import { expose } from 'comlink';
import * as webllm from '@mlc-ai/web-llm';

// ── Qwen2.5 7B via WebGPU ──
const DEFAULT_MODEL = 'Qwen2.5-7B-Instruct-q4f16_1-MLC';

let engine: webllm.MLCEngine | null = null;
let loadedModelId: string | null = null;
let progressCallbackWrapper: ((report: webllm.InitProgressReport) => void) | null = null;

export const aiWorker = {

  /**
   * Initialize or reload the WebLLM engine.
   * First call downloads the model (~4GB) and caches it in the browser.
   * Subsequent calls are instant (served from cache).
   */
  async initWebLLM(
    modelId: string = DEFAULT_MODEL,
    onProgress?: (progress: { text: string; progress: number }) => void
  ): Promise<{ success: boolean; modelId: string }> {
    progressCallbackWrapper = (report: webllm.InitProgressReport) => {
      onProgress?.({
        text: report.text,
        progress: report.progress,
      });
    };

    // Skip reload if same model already loaded
    if (engine && loadedModelId === modelId) {
      return { success: true, modelId };
    }

    if (!engine) {
      engine = new webllm.MLCEngine({
        initProgressCallback: (report: webllm.InitProgressReport) => {
          progressCallbackWrapper?.(report);
        }
      });
    }

    await engine.reload(modelId);

    loadedModelId = modelId;
    return { success: true, modelId };
  },

  /**
   * Generate text using the loaded WebLLM model.
   * Optionally enforces JSON output via a schema string.
   */
  async generate(
    prompt: string,
    jsonSchema?: string
  ): Promise<string> {
    if (!engine) throw new Error('WebLLM engine not initialized. Call initWebLLM() first.');

    let systemMsg = 'You are an expert AI financial data extraction assistant. Be concise and accurate.';
    const options: any = {
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    };

    if (jsonSchema) {
      systemMsg += `\n\nYou MUST return ONLY valid JSON. No markdown. No explanation. Match this schema exactly:\n${jsonSchema}`;
      options.messages[0].content = systemMsg;
      options.response_format = {
        type: 'json_object',
        schema: jsonSchema,
      };
    }

    const reply = await engine.chat.completions.create(options);

    return reply.choices[0].message.content ?? '';
  },

  /**
   * Generate text using the loaded WebLLM model with streaming.
   */
  async generateStream(
    prompt: string,
    history: { role: 'user' | 'model'; content: string }[],
    systemMsg: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (!engine) throw new Error('WebLLM engine not initialized. Call initWebLLM() first.');

    const options: any = {
      messages: [
        { role: 'system', content: systemMsg },
        ...history.map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content })),
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 4096,
      stream: true,
    };

    const asyncChunkGenerator = await engine.chat.completions.create(options) as unknown as AsyncIterable<any>;
    for await (const chunk of asyncChunkGenerator) {
      if (chunk.choices[0]?.delta?.content) {
        onChunk(chunk.choices[0].delta.content);
      }
    }
  },

  /**
   * Returns true if the engine is loaded and ready.
   */
  isReady(): boolean {
    return engine !== null && loadedModelId !== null;
  },

  /**
   * Returns the currently loaded model ID.
   */
  getLoadedModel(): string | null {
    return loadedModelId;
  },

  /**
   * Unload the engine to free GPU memory.
   */
  async unload(): Promise<void> {
    if (engine) {
      await engine.unload();
      engine = null;
      loadedModelId = null;
    }
  },
};

expose(aiWorker);
