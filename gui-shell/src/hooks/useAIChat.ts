import { useCallback, useEffect, useRef, useState } from "react";
import { STORAGE_KEYS } from "../constants";
import { API_BASE_URL } from "../config";
import { AI_PROVIDERS, getDefaultSettings } from "../ai-providers";
import type { AISettings, ChatMessage, CodeBlock } from "../types";

const CODE_BLOCK_RE = /```(\w*)\n([\s\S]*?)```/g;

function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let match: RegExpExecArray | null;
  CODE_BLOCK_RE.lastIndex = 0;
  while ((match = CODE_BLOCK_RE.exec(content)) !== null) {
    blocks.push({ language: match[1] || "python", code: match[2].trimEnd() });
  }
  return blocks;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.aiSettings);
    if (raw) return JSON.parse(raw) as AISettings;
  } catch { /* use defaults */ }
  return getDefaultSettings();
}

function saveSettings(settings: AISettings) {
  localStorage.setItem(STORAGE_KEYS.aiSettings, JSON.stringify(settings));
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.aiChatHistory);
    if (raw) return JSON.parse(raw) as ChatMessage[];
  } catch { /* fresh start */ }
  return [];
}

function saveHistory(messages: ChatMessage[]) {
  const trimmed = messages.slice(-100);
  localStorage.setItem(STORAGE_KEYS.aiChatHistory, JSON.stringify(trimmed));
}

export function useAIChat(
  currentCode: string,
  onApplyCode: (code: string) => void,
  active = false,
) {
  const [activated, setActivated] = useState(false);
  const [settings, setSettingsState] = useState<AISettings>(() =>
    active ? loadSettings() : getDefaultSettings()
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    active ? loadHistory() : []
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scriptHistoryRef = useRef<string[]>([]);
  const messagesRef = useRef(messages);
  const settingsRef = useRef(settings);
  const codeRef = useRef(currentCode);

  useEffect(() => {
    if (active && !activated) {
      setActivated(true);
      setSettingsState(loadSettings());
      setMessages(loadHistory());
    }
  }, [active, activated]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { codeRef.current = currentCode; }, [currentCode]);

  const setSettings = useCallback((next: AISettings) => {
    setSettingsState(next);
    saveSettings(next);
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEYS.aiChatHistory);
  }, []);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isStreaming) return;
      setStreamError(null);

      const currentSettings = settingsRef.current;
      const provider = AI_PROVIDERS[currentSettings.provider];
      if (!currentSettings.apiKey && currentSettings.provider !== "custom") {
        setStreamError(`Please set an API key for ${provider.label} in settings.`);
        return;
      }

      const userMsg: ChatMessage = {
        id: generateId(),
        role: "user",
        content: userText.trim(),
        codeBlocks: [],
        timestamp: Date.now(),
      };

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: "",
        codeBlocks: [],
        timestamp: Date.now(),
        isStreaming: true,
      };

      const currentMessages = messagesRef.current;
      setMessages([...currentMessages, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const chatHistory = [...currentMessages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const resp = await fetch(`${API_BASE_URL}/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: currentSettings.provider,
            model: currentSettings.model,
            apiKey: currentSettings.apiKey,
            baseUrl: currentSettings.baseUrl || null,
            messages: chatHistory,
            currentCode: codeRef.current,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          throw new Error(`Server error: ${resp.status}`);
        }

        const reader = resp.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let accumulated = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;

            try {
              const parsed = JSON.parse(payload) as { text?: string; error?: string };
              if (parsed.error) {
                setStreamError(parsed.error);
                break;
              }
              if (parsed.text) {
                accumulated += parsed.text;
              }
            } catch { /* skip malformed chunk */ }
          }

          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.id === assistantMsg.id) {
              updated[updated.length - 1] = {
                ...last,
                content: accumulated,
                codeBlocks: extractCodeBlocks(accumulated),
              };
            }
            return updated;
          });
        }

        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.id === assistantMsg.id) {
            const final: ChatMessage = {
              ...last,
              content: accumulated,
              codeBlocks: extractCodeBlocks(accumulated),
              isStreaming: false,
            };
            updated[updated.length - 1] = final;
          }
          saveHistory(updated);
          return updated;
        });
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last) updated[updated.length - 1] = { ...last, isStreaming: false };
            saveHistory(updated);
            return updated;
          });
        } else {
          setStreamError((err as Error).message);
          setMessages((prev) => {
            const updated = prev.filter((m) => m.id !== assistantMsg.id);
            saveHistory(updated);
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming],
  );

  const applyCode = useCallback(
    (code: string) => {
      scriptHistoryRef.current.push(currentCode);
      onApplyCode(code);
    },
    [currentCode, onApplyCode],
  );

  const undoApply = useCallback(() => {
    const prev = scriptHistoryRef.current.pop();
    if (prev !== undefined) {
      onApplyCode(prev);
    }
  }, [onApplyCode]);

  const canUndo = scriptHistoryRef.current.length > 0;

  return {
    settings,
    setSettings,
    messages,
    isStreaming,
    streamError,
    sendMessage,
    stopStreaming,
    clearHistory,
    applyCode,
    undoApply,
    canUndo,
  };
}
