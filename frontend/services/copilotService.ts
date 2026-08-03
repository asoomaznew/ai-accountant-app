import { getLLMConfig, streamWebLLM } from "./localLlmService";
import { useAppStore } from "../store/useAppStore";
import { AppMode } from "../types";

export interface CopilotResponse {
  thoughts: string;
  content: string;
  suggestions: string[];
  action?: any;
}

export function extractStructuredResponse(fullText: string) {
  let thoughts = "";
  let content = "";
  let actionJson = "";
  const suggestions: string[] = [];

  // Extract thoughts
  const thoughtsMatch = fullText.match(/<thoughts>([\s\S]*?)(?:<\/thoughts>|$)/i);
  if (thoughtsMatch) {
    thoughts = thoughtsMatch[1].trim();
  }

  // Extract action
  const actionMatch = fullText.match(/<action>([\s\S]*?)(?:<\/action>|$)/i);
  if (actionMatch) {
    actionJson = actionMatch[1].trim();
  }

  // Extract suggestions
  const suggestionsMatch = fullText.match(/<suggestions>([\s\S]*?)(?:<\/suggestions>|$)/i);
  if (suggestionsMatch) {
    const lines = suggestionsMatch[1].split('\n').map(l => l.trim()).filter(l => l.length > 0);
    suggestions.push(...lines);
  }

  // Extract content (remove tags and their contents)
  content = fullText
    .replace(/<thoughts>[\s\S]*?(?:<\/thoughts>|$)/gi, '')
    .replace(/<action>[\s\S]*?(?:<\/action>|$)/gi, '')
    .replace(/<suggestions>[\s\S]*?(?:<\/suggestions>|$)/gi, '')
    .trim();

  return { thoughts, content, actionJson, suggestions };
}

export function executeAction(action: any) {
  if (!action || !action.type) return;

  switch (action.type) {
    case 'navigate_to':
      if (action.page) {
        useAppStore.getState().setAppMode(action.page as AppMode);
      }
      break;
    case 'update_offset':
      if (action.vendor && action.account) {
        if (action.system === 'warba') {
          useAppStore.getState().updateWarbaVendorOffsetAccount(action.vendor, action.account);
        } else {
          useAppStore.getState().updateVendorOffsetAccount(action.vendor, action.account);
        }
      }
      break;
    default:
      console.warn("Unknown action type:", action.type);
  }
}

export async function streamCopilot(
  prompt: string,
  history: { role: 'user' | 'model'; content: string }[],
  onUpdate: (data: CopilotResponse) => void
): Promise<void> {
  const config = getLLMConfig();
  
  const appMode = useAppStore.getState().appMode;
  const vendorOffsetAccounts = useAppStore.getState().vendorOffsetAccounts;
  const warbaVendorOffsetAccounts = useAppStore.getState().warbaVendorOffsetAccounts;
  const currentJournalEntries = useAppStore.getState().currentJournalEntries;

  const systemPrompt = `You are the AI Accountant Copilot, an expert AI accountant and system automation assistant for "AI Accountant" (Kuwait - KD currency).
You can help the user view and analyze bank statements, check transaction results, change application settings, update offset account mappings, and navigate around the app.

Here is the current application context:
- Active Navigation Page/Tab: "${appMode}"
- Available Navigation Pages:
  - "home" (Dashboard Overview)
  - "entry" (Clover/Merchant Journal Entry Automation)
  - "warba_entry" (Warba Journal Entry Automation)
  - "pos_entry" (POS Entry Automation)
  - "pos_report" (POS Processing Jobs & Reports)
  - "ai_settings" (AI Models and Provider Settings)
  - "ending_balance" (Ending Balance Verification)
  - "merge_pdfs" (Merge Statement PDFs)
  - "convert_001_to_49" (Convert KIB 001 to 49 Account Statements)
  - "keyword_search" (OCR Search & Queue)
  - "search" (QA Statement Search)
  - "smart_merge" (Smart Merge of Statement files)
  - "rename" (Statement Renaming Tool)
- Clover Vendor Offset Mappings: ${JSON.stringify(vendorOffsetAccounts, null, 2)}
- Warba Vendor Offset Mappings: ${JSON.stringify(warbaVendorOffsetAccounts, null, 2)}
- Currently Parsed Journal Entries/Transactions: ${JSON.stringify(currentJournalEntries.slice(0, 100), null, 2)} (showing first 100 entries, if any are loaded).

You can call actions in the app by outputting an XML tag: <action>JSON_OBJECT</action>.
Supported actions:
1. Navigate to a page:
   <action>{"type": "navigate_to", "page": "ai_settings"}</action>
2. Update Clover offset mapping for a vendor:
   <action>{"type": "update_offset", "system": "clover", "vendor": "IRIS POLYCLINIC", "account": "50-000004"}</action>
3. Update Warba offset mapping for a vendor:
   <action>{"type": "update_offset", "system": "warba", "vendor": "IRIS POLYCLINIC", "account": "50-000004"}</action>

Always split your output using these XML tags:
- <thoughts>Your step-by-step reasoning or actions you are taking. ALWAYS include this at the start of your response.</thoughts>
- Any <action>...</action> if you want to execute a command.
- Your final friendly Markdown response to the user.
- <suggestions>
  Clickable suggestion prompt 1
  Clickable suggestion prompt 2
  </suggestions> (always include 1-3 relevant clickable suggestions for the user at the very end of your response).`;

  const contents = [
    ...history.map(h => ({
      role: h.role === 'model' ? 'model' as const : 'user' as const,
      parts: [{ text: h.content }]
    })),
    { role: 'user' as const, parts: [{ text: prompt }] }
  ];

  let fullText = "";

  if (config.provider === 'ollama') {
    const baseUrl = config.ollamaBaseUrl.replace(/\/$/, '');
    const model = config.ollamaModel;
    if (!model) throw new Error("No Ollama model selected. Go to AI Settings.");

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content })),
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        stream: true
      })
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.statusText}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Could not read response stream.");
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.replace('data: ', '').trim();
          if (dataStr === '[DONE]') break;
          try {
            const parsedJson = JSON.parse(dataStr);
            const chunkText = parsedJson.choices?.[0]?.delta?.content || "";
            if (chunkText) {
              fullText += chunkText;
              const parsed = extractStructuredResponse(fullText);
              onUpdate(parsed);
            }
          } catch {
            // ignore JSON parse fail
          }
        }
      }
    }
  } else if (config.provider === 'webllm') {
    try {
      await streamWebLLM(
        prompt,
        history,
        systemPrompt,
        (chunkText: string) => {
          fullText += chunkText;
          const parsed = extractStructuredResponse(fullText);
          onUpdate(parsed);
        }
      );
    } catch (e: any) {
      onUpdate({
        thoughts: "WebLLM stream failed",
        content: `Error streaming from WebLLM: ${e.message}`,
        suggestions: ["Check Settings", "Switch to WebLLM"]
      });
    }
  } else {
    // Python Rules Engine fallback - Route to Backend ChatbotAgent
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
    try {
      const res = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('google_token') || (import.meta.env.DEV ? 'local_bypass_token' : '')}`
        },
        body: JSON.stringify({
          message: prompt,
          context: history,
          system_prompt: systemPrompt
        })
      });
      
      if (!res.ok) throw new Error(`Backend error: ${res.status}`);
      
      const data = await res.json();
      fullText = data.response || "";
      
      const parsed = extractStructuredResponse(fullText);
      onUpdate(parsed);
    } catch (e: any) {
      onUpdate({
        thoughts: "Failed to connect to backend ChatbotAgent.",
        content: `Error: ${e.message}. The Python Rules Engine requires the backend to be running to process chat via its LLM Gateway.`,
        suggestions: ["Check Connection"]
      });
    }
  }

  // Action execution
  const finalParsed = extractStructuredResponse(fullText);
  if (finalParsed.actionJson) {
    try {
      const action = JSON.parse(finalParsed.actionJson);
      executeAction(action);
      onUpdate({ ...finalParsed, action });
    } catch (e) {
      console.error("Failed to parse action JSON:", e);
    }
  }
}
