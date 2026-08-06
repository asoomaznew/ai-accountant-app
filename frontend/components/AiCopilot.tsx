import React, { useState, useRef, useEffect, Component } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Bot, User, Loader2, BrainCircuit, ChevronDown, ChevronRight, X, Sparkles, Trash2, ArrowUp } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { streamCopilot } from '../services/copilotService';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return <div className="text-red-500 text-xs p-2">MD Err: {this.state.error?.message}</div>;
    }
    return this.props.children;
  }
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  thoughts?: string;
  suggestions?: string[];
  timestamp: Date;
}

export default function AiCopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState<{ [key: string]: boolean }>({});
  
  const appMode = useAppStore(state => state.appMode);
  const currentJournalEntries = useAppStore(state => state.currentJournalEntries);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat list
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(scrollHeight, 112) + 'px';
      textareaRef.current.style.overflowY = scrollHeight > 112 ? 'auto' : 'hidden';
    }
  }, [input]);

  // Clean chat state
  const handleClearChat = () => {
    setMessages([]);
    setExpandedThoughts({});
  };

  // Generate suggested queries depending on the active tab
  const getSuggestionsForTab = (): string[] => {
    const list: string[] = [];
    
    if (currentJournalEntries.length > 0) {
      list.push("Summarize parsed journal entries");
      list.push("Verify total debit/credit amounts");
    }

    switch (appMode) {
      case "home":
        list.push("Take me to Clover Automation page");
        list.push("Take me to Warba Automation page");
        list.push("Go to AI Engine Settings");
        break;
      case "entry":
        list.push("What Clover vendors are configured?");
        list.push("How is the offset account resolved?");
        break;
      case "warba_entry":
        list.push("Show Warba vendor offset accounts");
        list.push("How are deposits mapped in Warba?");
        break;
      case "ai_settings":
        list.push("Explain Ollama vs WebLLM settings");
        list.push("How can I download local LLM models?");
        break;
      default:
        list.push("Go back to Dashboard");
        break;
    }

    return list.slice(0, 3);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || isLoading) return;

    if (!overrideText) setInput('');
    setIsLoading(true);

    const userMessage: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: textToSend.trim(),
      timestamp: new Date()
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    // Initial placeholder for bot message
    const botMsgId = Math.random().toString(36).substring(7);
    const botPlaceholder: ChatMessage = {
      id: botMsgId,
      role: 'model',
      content: '',
      thoughts: '',
      suggestions: [],
      timestamp: new Date()
    };

    setMessages([...updatedMessages, botPlaceholder]);

    try {
      const history = updatedMessages.map(m => ({
        role: m.role,
        content: m.content
      }));

      await streamCopilot(textToSend.trim(), history, (update) => {
        setMessages(prev => {
          const next = [...prev];
          const botIdx = next.findIndex(m => m.id === botMsgId);
          if (botIdx !== -1) {
            next[botIdx] = {
              ...next[botIdx],
              content: update.content,
              thoughts: update.thoughts,
              suggestions: update.suggestions
            };
          }
          return next;
        });
      });
    } catch (err: any) {
      setMessages(prev => {
        const next = [...prev];
        const botIdx = next.findIndex(m => m.id === botMsgId);
        if (botIdx !== -1) {
          next[botIdx] = {
            ...next[botIdx],
            content: `⚠️ Error: ${err.message || 'Could not stream response from LLM.'}`
          };
        }
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed right-6 bottom-6 z-50 p-4 bg-gradient-to-tr from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white rounded-full shadow-[0_0_20px_rgba(56,189,248,0.5)] hover:shadow-[0_0_30px_rgba(56,189,248,0.8)] transition-all duration-300 transform hover:scale-105 active:scale-95 group"
        aria-label="Open AI Copilot"
      >
        <Sparkles className="w-6 h-6 animate-pulse group-hover:rotate-12 transition-transform duration-300" />
      </button>

      {/* Slide-out Sidebar Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[460px] bg-slate-900/95 backdrop-blur-xl border-l border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800/80 bg-slate-950/20">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-sky-400" />
            <span className="font-semibold text-slate-100 tracking-wide text-sm uppercase">AI Accountant Copilot</span>
          </div>
          <div className="flex items-center space-x-2">
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800/50 rounded-lg transition-colors"
                title="Clear Chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 animate-fade-in">
              <div className="w-16 h-16 rounded-3xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-center shadow-inner">
                <Bot className="w-8 h-8 text-sky-400" />
              </div>
              <div className="max-w-xs space-y-2">
                <h3 className="text-slate-200 font-semibold">How can I help you today?</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  I can analyze your parsed bank statements, run journal validations, change mappings, or navigate to other pages.
                </p>
              </div>
              {/* Prepopulated Suggestions */}
              <div className="w-full pt-4 flex flex-col gap-2">
                {getSuggestionsForTab().map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(s)}
                    className="text-left text-xs bg-slate-800/40 hover:bg-slate-800/80 text-slate-300 p-3 rounded-xl border border-slate-800 hover:border-slate-700/60 transition-all duration-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'} animate-fade-in`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow border ${m.role === 'user' ? 'bg-indigo-900/30 border-indigo-700/30' : 'bg-slate-850 border-slate-700/50'}`}>
                  {m.role === 'user' ? (
                    <User className="w-4.5 h-4.5 text-indigo-400" />
                  ) : (
                    <Bot className="w-4.5 h-4.5 text-sky-400" />
                  )}
                </div>
                <div className="max-w-[82%] flex flex-col gap-2">
                  
                  {/* Thoughts/Reasoning Logs */}
                  {m.role === 'model' && m.thoughts && m.thoughts.trim().length > 0 && (
                    <div className="bg-slate-950/30 border border-slate-800/80 rounded-xl overflow-hidden shadow-inner">
                      <button
                        onClick={() => setExpandedThoughts(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 transition-colors"
                      >
                        {expandedThoughts[m.id] ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                        <BrainCircuit className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                        <span className="truncate text-left">
                          {m.content ? "View reasoning process" : (m.thoughts.split('\n').filter(l => l.trim().length > 0).pop() || "Thinking...")}
                        </span>
                      </button>
                      {expandedThoughts[m.id] && (
                        <div className="px-3 pb-3 pt-2 border-t border-slate-800/40 max-h-[180px] overflow-y-auto bg-black/20 text-[10px] font-mono leading-relaxed text-slate-500 flex flex-col gap-1.5">
                          {m.thoughts.split('\n').filter(l => l.trim().length > 0).map((line, idx) => (
                            <div key={idx} className="flex gap-2 items-start">
                              <span className="text-sky-500/50 mt-[1px]">›</span>
                              <span className="break-words whitespace-pre-wrap">{line}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Loading indicator */}
                  {m.role === 'model' && !m.content && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 italic ml-1 mt-1">
                      <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                      {m.thoughts ? 'Reasoning...' : 'Fetching context...'}
                    </div>
                  )}

                  {/* Main markdown content bubble */}
                  {m.content && (
                    <div className={`p-3.5 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-indigo-600 text-slate-100 rounded-tr-none border border-indigo-500/20' : 'bg-slate-800/80 text-slate-200 rounded-tl-none border border-slate-700/30 shadow-md'}`}>
                      {m.role === 'model' ? (
                        <ErrorBoundary>
                          <div className="[&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:list-disc [&>ul]:ml-5 [&>h3]:font-semibold [&>h3]:text-slate-100 [&>h3]:mb-1 [&>h3]:mt-3 [&>ol]:list-decimal [&>ol]:ml-5 [&_code]:bg-slate-900/80 [&_code]:text-sky-300 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_a]:text-sky-400 [&_a]:underline">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {m.content}
                            </ReactMarkdown>
                          </div>
                        </ErrorBoundary>
                      ) : (
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      )}
                    </div>
                  )}

                  {/* Suggestions list */}
                  {m.role === 'model' && m.suggestions && m.suggestions.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-2 animate-fade-in">
                      {m.suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(s)}
                          disabled={isLoading}
                          className="text-left text-xs bg-slate-800/30 hover:bg-slate-800/70 text-slate-300 p-2.5 rounded-xl border border-slate-800/80 hover:border-slate-700/60 transition-colors disabled:opacity-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Bar Form */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/20 flex items-end gap-2 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Ask a question or enter a command..."
            rows={1}
            className="w-full bg-slate-900/60 border border-slate-800 hover:border-slate-700 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none text-slate-100 placeholder-slate-500 resize-none max-h-28 overflow-y-auto transition-all"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="absolute right-6 bottom-6 p-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 rounded-full text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md"
            aria-label="Send Message"
          >
            <ArrowUp className="w-4.5 h-4.5 font-bold" />
          </button>
        </div>
      </div>
    </>
  );
}
