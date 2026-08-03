// ─────────────────────────────────────────────────────────────────────────────
// components/AISettings.tsx
// Choose AI provider: Gemini Cloud | Ollama (local server) | WebLLM (local browser GPU)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Cpu, CheckCircle2, AlertCircle, Loader2,
  RefreshCw, ChevronDown, Server, Shield, Zap, Cloud,
  HardDrive,
} from 'lucide-react';
import {
  getLLMConfig,
  pingOllama, fetchOllamaModels,
  initWebLLM, isWebLLMReady,
  getActiveWebLLMModel,
  WEBLLM_MODELS,
  type LLMProvider, type OllamaModel, type WebLLMModelOption,
} from '../services/localLlmService';
import { useAppStore } from '../store/useAppStore';
import { cn, formatBytes } from '../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type OllamaStatus = 'unknown' | 'checking' | 'online' | 'offline';

// ─────────────────────────────────────────────────────────────────────────────
// Status dot
// ─────────────────────────────────────────────────────────────────────────────

const StatusDot = ({ status }: { status: OllamaStatus }) => {
  const colors: Record<OllamaStatus, string> = {
    unknown:  'bg-slate-600',
    checking: 'bg-amber-400 animate-pulse',
    online:   'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]',
    offline:  'bg-red-400',
  };
  return <span className={cn('inline-block w-2 h-2 rounded-full shrink-0', colors[status])} />;
};

// ─────────────────────────────────────────────────────────────────────────────
// Provider tab definitions
// ─────────────────────────────────────────────────────────────────────────────

interface Tab { id: LLMProvider; label: string; icon: React.ReactNode; sub: string }

const TABS: readonly Tab[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    sub: 'Local · Your models',
    icon: <Server size={18} />,
  },
  {
    id: 'webllm',
    label: 'WebLLM',
    sub: 'Browser GPU · Local',
    icon: <Cpu size={18} />,
  },
  {
    id: 'none',
    label: 'Python Only',
    sub: 'No AI · Rules Engine',
    icon: <Server size={18} />,
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

const AISettings: React.FC = () => {
  const setLLMConfig = useAppStore((state) => state.setLLMConfig);
  const [provider, setProvider]           = useState<LLMProvider>('none');
  const [ollamaUrl, setOllamaUrl]         = useState('http://localhost:11434');
  const [ollamaStatus, setOllamaStatus]   = useState<OllamaStatus>('unknown');
  const [ollamaModels, setOllamaModels]   = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [dropdownOpen, setDropdownOpen]   = useState(false);
  const [saved, setSaved]                 = useState(false);

  const [isLoadingWebLLM, setIsLoadingWebLLM] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('');
  const [isWebLLMInitialized, setIsWebLLMInitialized] = useState(false);
  
  const [selectedWebLlmModel, setSelectedWebLlmModel] = useState('Qwen2.5-7B-Instruct-q4f16_1-MLC');
  const [webllmDropdownOpen, setWebllmDropdownOpen]   = useState(false);

  // Restore saved config on mount
  useEffect(() => {
    const cfg = getLLMConfig();
    setProvider(cfg.provider);
    setOllamaUrl(cfg.ollamaBaseUrl);
    setSelectedModel(cfg.ollamaModel);
    setSelectedWebLlmModel(cfg.webllmModelId);
    if (typeof window !== 'undefined') {
      setIsWebLLMInitialized(isWebLLMReady() && getActiveWebLLMModel() === cfg.webllmModelId);
    }
    if (cfg.provider === 'ollama') handleCheckOllama(cfg.ollamaBaseUrl, cfg.ollamaModel);
  }, []);

  // Sync initialization state when selected model changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsWebLLMInitialized(isWebLLMReady() && getActiveWebLLMModel() === selectedWebLlmModel);
    }
  }, [selectedWebLlmModel]);

  const handleCheckOllama = useCallback(async (url?: string, preselect?: string) => {
    const target = (url ?? ollamaUrl).replace(/\/$/, '');
    setOllamaStatus('checking');
    setOllamaModels([]);
    try {
      const online = await pingOllama(target);
      if (!online) { setOllamaStatus('offline'); return; }
      const models = await fetchOllamaModels(target);
      setOllamaModels(models);
      setOllamaStatus('online');
      // Auto-select: use preselect, or current, or first model
      const toSelect = preselect ?? selectedModel;
      const found = models.find(m => m.name === toSelect);
      if (found) setSelectedModel(found.name);
      else if (models.length > 0) setSelectedModel(models[0].name);
    } catch {
      setOllamaStatus('offline');
    }
  }, [ollamaUrl, selectedModel]);

  const handleLoadWebLLM = useCallback(async () => {
    setIsLoadingWebLLM(true);
    setLoadingProgress(0);
    setLoadingText('Initializing WebLLM background worker...');
    try {
      // Ensure the selected model is set in config before loading
      setLLMConfig({ webllmModelId: selectedWebLlmModel });
      await initWebLLM(({ text, progress }) => {
        setLoadingText(text);
        setLoadingProgress(Math.round(progress * 100));
      });
      setIsWebLLMInitialized(true);
    } catch (e: any) {
      console.error(e);
      alert(`Failed to load WebLLM model: ${e?.message || e}`);
    } finally {
      setIsLoadingWebLLM(false);
    }
  }, [selectedWebLlmModel]);

  const handleSave = useCallback(() => {
    setLLMConfig({
      provider,
      ollamaBaseUrl: ollamaUrl,
      ollamaModel: selectedModel,
      webllmModelId: selectedWebLlmModel,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [provider, ollamaUrl, selectedModel, selectedWebLlmModel]);

  const selectedWebLlmOption = WEBLLM_MODELS.find(m => m.id === selectedWebLlmModel) || WEBLLM_MODELS[0];

  const canSave =
    provider === 'webllm' ||
    provider === 'none' ||
    (provider === 'ollama' && ollamaStatus === 'online' && !!selectedModel);

  return (
    <div className="max-w-xl space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-[18px] font-bold text-white">AI Engine</h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Choose the AI brain for all document processing.
        </p>
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-2 gap-3">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setProvider(tab.id); setSaved(false); }}
            aria-pressed={provider === tab.id}
            className={cn(
              'relative flex flex-col items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70',
              provider === tab.id
                ? 'border-blue-500/60 bg-blue-500/[0.07]'
                : 'border-white/[0.08] bg-[#13141a] hover:border-white/[0.15]'
            )}
          >
            <div className={cn(
              'flex items-center justify-center w-10 h-10 rounded-xl transition-colors',
              provider === tab.id
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-white/[0.05] text-slate-500'
            )}>
              {tab.icon}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-white">{tab.label}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{tab.sub}</p>
            </div>
            {/* Selected indicator */}
            <div className={cn(
              'absolute top-3 right-3 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
              provider === tab.id ? 'border-blue-500 bg-blue-500' : 'border-slate-700'
            )}>
              {provider === tab.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
            </div>
          </button>
        ))}
      </div>

      {/* Panel */}
      <AnimatePresence mode="wait">

        {/* ─── Ollama Panel ─── */}
        {provider === 'ollama' && (
          <motion.div
            key="ollama"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            {/* Info strip */}
            <div className="rounded-2xl bg-[#13141a] border border-white/[0.07] p-5 space-y-4">
              <div className="flex items-start gap-3">
                <Server size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-white">Ollama — Your Local Models</p>
                  <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">
                    Uses your already-downloaded Ollama models. No re-download needed.
                    Data never leaves your Mac.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: <Shield size={13} />,    label: '100% Private',       sub: 'Stays on Mac' },
                  { icon: <HardDrive size={13} />,  label: 'Your models',        sub: 'Already downloaded' },
                  { icon: <Cpu size={13} />,         label: 'No GPU needed',      sub: 'CPU / Metal' },
                ].map(({ icon, label, sub }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                    <span className="text-slate-500">{icon}</span>
                    <span className="text-[11px] font-medium text-slate-300">{label}</span>
                    <span className="text-[10px] text-slate-600">{sub}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* URL + Check */}
            <div className="rounded-2xl bg-[#13141a] border border-white/[0.07] p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                  Server URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={e => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="flex-1 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-all font-mono"
                  />
                  <button
                    onClick={() => handleCheckOllama()}
                    disabled={ollamaStatus === 'checking'}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-[13px] text-slate-300 hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-50"
                  >
                    {ollamaStatus === 'checking'
                      ? <Loader2 size={14} className="animate-spin" />
                      : <RefreshCw size={14} />}
                    Check
                  </button>
                </div>
              </div>

              {/* Status */}
              <div className={cn(
                'flex items-center gap-2.5 px-4 py-3 rounded-xl border text-[12px] font-medium',
                ollamaStatus === 'online'   ? 'bg-emerald-500/[0.07] border-emerald-500/25 text-emerald-300' :
                ollamaStatus === 'offline'  ? 'bg-red-500/[0.07] border-red-500/25 text-red-300' :
                ollamaStatus === 'checking' ? 'bg-amber-500/[0.07] border-amber-500/20 text-amber-300' :
                'bg-white/[0.03] border-white/[0.07] text-slate-500'
              )}>
                <StatusDot status={ollamaStatus} />
                {ollamaStatus === 'unknown'  && 'Press Check to detect running models'}
                {ollamaStatus === 'checking' && 'Connecting to Ollama…'}
                {ollamaStatus === 'online'   && `Connected · ${ollamaModels.length} model${ollamaModels.length !== 1 ? 's' : ''} available`}
                {ollamaStatus === 'offline'  && 'Cannot reach Ollama — run: ollama serve'}
              </div>

              {/* Model picker */}
              <AnimatePresence>
                {ollamaStatus === 'online' && ollamaModels.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={cn(dropdownOpen ? 'overflow-visible' : 'overflow-hidden')}
                  >
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                      Model
                    </label>
                    <div className="relative">
                      <button
                        onClick={() => setDropdownOpen(o => !o)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Server size={14} className="text-slate-500 shrink-0" />
                          <span className="text-[13px] text-slate-200 truncate font-mono">
                            {selectedModel || 'Choose a model…'}
                          </span>
                        </div>
                        <ChevronDown size={14} className={cn('text-slate-500 shrink-0 transition-transform', dropdownOpen && 'rotate-180')} />
                      </button>

                      <AnimatePresence>
                        {dropdownOpen && (
                          <motion.ul
                            initial={{ opacity: 0, y: -4, scaleY: 0.95 }}
                            animate={{ opacity: 1, y: 0, scaleY: 1 }}
                            exit={{ opacity: 0, y: -4, scaleY: 0.95 }}
                            transition={{ duration: 0.15 }}
                            style={{ transformOrigin: 'top' }}
                            className="absolute z-20 w-full mt-1 rounded-xl bg-[#1c1d27] border border-white/[0.1] shadow-2xl overflow-hidden"
                            role="listbox"
                          >
                            {ollamaModels.map(m => (
                              <li key={m.name} role="option" aria-selected={m.name === selectedModel}>
                                <button
                                  onClick={() => { setSelectedModel(m.name); setDropdownOpen(false); }}
                                  className={cn(
                                    'w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                                    m.name === selectedModel
                                      ? 'bg-blue-500/15 text-blue-300'
                                      : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
                                  )}
                                >
                                  <span className="text-[13px] font-mono truncate">{m.name}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[11px] text-slate-600">{formatBytes(m.size)}</span>
                                    {m.name === selectedModel && (
                                      <CheckCircle2 size={13} className="text-blue-400" />
                                    )}
                                  </div>
                                </button>
                              </li>
                            ))}
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Offline hint */}
              {ollamaStatus === 'offline' && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <AlertCircle size={13} className="text-slate-600 shrink-0" />
                  <code className="text-[12px] text-slate-600 font-mono">ollama serve</code>
                  <span className="text-[11px] text-slate-700">— run in Terminal to start Ollama</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── WebLLM Panel ─── */}
        {provider === 'webllm' && (
          <motion.div
            key="webllm"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            {/* Info strip */}
            <div className="rounded-2xl bg-[#13141a] border border-white/[0.07] p-5 space-y-4">
              <div className="flex items-start gap-3">
                <Cpu size={16} className="text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-white">WebLLM — Browser WebGPU (100% Local)</p>
                  <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">
                    Runs LLM models entirely inside your browser sandbox using hardware-accelerated WebGPU.
                    Weights are cached locally in your browser storage. Subsequent loads are instant.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: <Shield size={13} />,    label: '100% Private',       sub: 'No local server' },
                  { icon: <Cpu size={13} />,       label: 'Uses WebGPU',        sub: 'Hardware accelerated' },
                  { icon: <HardDrive size={13} />,  label: 'Browser Cached',     sub: 'Offline after download' },
                ].map(({ icon, label, sub }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                    <span className="text-slate-500">{icon}</span>
                    <span className="text-[11px] font-medium text-slate-300">{label}</span>
                    <span className="text-[10px] text-slate-600">{sub}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Model Selection */}
            <div className="rounded-2xl bg-[#13141a] border border-white/[0.07] p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                  Select Model
                </label>
                <div className="relative">
                  <button
                    onClick={() => setWebllmDropdownOpen(o => !o)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Cpu size={14} className="text-blue-400 shrink-0" />
                      <span className="text-[13px] text-slate-200 truncate font-mono">
                        {selectedWebLlmOption.name} ({selectedWebLlmOption.sizeStr})
                      </span>
                    </div>
                    <ChevronDown size={14} className={cn('text-slate-500 shrink-0 transition-transform', webllmDropdownOpen && 'rotate-180')} />
                  </button>

                  <AnimatePresence>
                    {webllmDropdownOpen && (
                      <motion.ul
                        initial={{ opacity: 0, y: -4, scaleY: 0.95 }}
                        animate={{ opacity: 1, y: 0, scaleY: 1 }}
                        exit={{ opacity: 0, y: -4, scaleY: 0.95 }}
                        transition={{ duration: 0.15 }}
                        style={{ transformOrigin: 'top' }}
                        className="absolute z-20 w-full mt-1 rounded-xl bg-[#1c1d27] border border-white/[0.1] shadow-2xl overflow-hidden max-h-60 overflow-y-auto"
                        role="listbox"
                      >
                        {WEBLLM_MODELS.map(m => (
                          <li key={m.id} role="option" aria-selected={m.id === selectedWebLlmModel}>
                            <button
                              onClick={() => { setSelectedWebLlmModel(m.id); setWebllmDropdownOpen(false); }}
                              className={cn(
                                'w-full flex flex-col items-start gap-1 px-4 py-3 text-left transition-colors border-b border-white/[0.03] last:border-0',
                                m.id === selectedWebLlmModel
                                  ? 'bg-blue-500/15 text-blue-300'
                                  : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
                              )}
                            >
                              <div className="w-full flex items-center justify-between gap-3">
                                <span className="text-[13px] font-semibold truncate">{m.name}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] text-slate-500 font-mono">{m.sizeStr}</span>
                                  {m.id === selectedWebLlmModel && (
                                    <CheckCircle2 size={13} className="text-blue-400" />
                                  )}
                                </div>
                              </div>
                              <span className="text-[11px] text-slate-500 leading-normal line-clamp-2 mt-0.5">
                                {m.description}
                              </span>
                            </button>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Model Init Panel */}
            <div className="rounded-2xl bg-[#13141a] border border-white/[0.07] p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                  Model Status
                </label>
                
                {isWebLLMInitialized ? (
                  <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border text-[12px] font-medium bg-emerald-500/[0.07] border-emerald-500/25 text-emerald-300 animate-fade-in">
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                    Model loaded & ready in browser memory!
                  </div>
                ) : isLoadingWebLLM ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-slate-300 font-medium truncate pr-4">{loadingText || "Downloading model..."}</span>
                      <span className="text-blue-400 font-bold font-mono shrink-0">{loadingProgress}%</span>
                    </div>
                    <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${loadingProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border text-[12px] font-medium bg-white/[0.02] border-white/[0.07] text-slate-400">
                      <AlertCircle size={14} className="text-slate-500 shrink-0" />
                      Model not loaded in browser memory.
                    </div>
                    <button
                      onClick={handleLoadWebLLM}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-[13px] shadow-lg shadow-blue-500/20 transition-all"
                    >
                      Load & Initialize Model (~{selectedWebLlmOption.sizeStr})
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
        {/* ─── Python Only Panel ─── */}
        {provider === 'none' && (
          <motion.div
            key="none"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="rounded-2xl bg-[#13141a] border border-white/[0.07] p-5 space-y-4"
          >
            <div className="flex items-start gap-3">
              <Server size={16} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-white">Python Rules Engine — Active</p>
                <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">
                  Bypasses all LLM/AI models. Document parsing and processing runs exclusively on the local Python rules and regex matching backend. Fast, lightweight, and 100% private.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { icon: <Zap size={13} />,      label: 'Zero latency',    sub: 'Instant rules' },
                { icon: <Server size={13} />,  label: 'Python backend',  sub: 'No external API' },
                { icon: <Shield size={13} />, label: '100% Offline', sub: 'Safe and private' },
              ].map(({ icon, label, sub }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                  <span className="text-slate-500">{icon}</span>
                  <span className="text-[11px] font-medium text-slate-300">{label}</span>
                  <span className="text-[10px] text-slate-600">{sub}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={!canSave}
        className={cn(
          'flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70',
          saved
            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
            : canSave
            ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/20'
            : 'bg-white/[0.04] border border-white/[0.07] text-slate-600 cursor-not-allowed'
        )}
      >
        {saved ? (
          <><CheckCircle2 size={15} /> Saved</>
        ) : provider === 'ollama' && ollamaStatus !== 'online' ? (
          'Check connection first'
        ) : (
          'Save & Apply'
        )}
      </button>
    </div>
  );
};

export default memo(AISettings);
