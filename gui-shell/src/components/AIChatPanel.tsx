import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Settings,
  Send,
  Square,
  Trash2,
  Bot,
  User,
  X,
  Code2,
  Copy,
  Check,
} from "lucide-react";
import type { AISettings, ChatMessage } from "../types";
import AIDiffPreview from "./AIDiffPreview";
import AISettingsModal from "./AISettingsModal";
import { AI_PROVIDERS } from "../ai-providers";

type Props = {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamError: string | null;
  settings: AISettings;
  currentCode: string;
  canUndo: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onClear: () => void;
  onApplyCode: (code: string) => void;
  onUndoApply: () => void;
  onUpdateSettings: (settings: AISettings) => void;
  onClose: () => void;
};

/* ── Lightweight inline markdown ──
   Handles bold, italic, inline code, headings, unordered lists,
   and paragraph breaks. Fenced code blocks are already split out
   by the caller so this never sees them. */

function renderMarkdownInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)/g;
  let cursor = 0;
  let m: RegExpExecArray | null;

  re.lastIndex = 0;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) {
      nodes.push(text.slice(cursor, m.index));
    }
    if (m[2]) {
      nodes.push(<strong key={`b${idx}`} className="aiMdBold">{m[2]}</strong>);
    } else if (m[4]) {
      nodes.push(<em key={`i${idx}`} className="aiMdItalic">{m[4]}</em>);
    } else if (m[6]) {
      nodes.push(<code key={`c${idx}`} className="aiMdInlineCode">{m[6]}</code>);
    }
    cursor = m.index + m[0].length;
    idx++;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function renderMarkdown(text: string): React.ReactNode[] {
  const blocks = text.split(/\n{2,}/);
  const out: React.ReactNode[] = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi].trim();
    if (!block) continue;

    if (/^#{1,4}\s/.test(block)) {
      const heading = block.replace(/^#{1,4}\s+/, "");
      out.push(
        <div key={`h-${bi}`} className="aiMdHeading">
          {renderMarkdownInline(heading)}
        </div>,
      );
      continue;
    }

    const lines = block.split("\n");
    const isAllList = lines.every((l) => /^\s*[-*]\s/.test(l));
    if (isAllList) {
      out.push(
        <ul key={`ul-${bi}`} className="aiMdList">
          {lines.map((l, li) => (
            <li key={li} className="aiMdListItem">
              {renderMarkdownInline(l.replace(/^\s*[-*]\s+/, ""))}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    out.push(
      <p key={`p-${bi}`} className="aiMdParagraph">
        {renderMarkdownInline(block)}
      </p>,
    );
  }

  return out;
}

/* ── Relative time ── */

function relativeTime(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ── Copy button with feedback ── */

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      className={`aiCopyBtn ${copied ? "aiCopyBtn--done" : ""}`}
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy code"}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

/* ── Message content renderer ── */

function MessageContent({
  message,
  currentCode,
  onApply,
  onUndo,
  canUndo,
}: {
  message: ChatMessage;
  currentCode: string;
  onApply: (code: string) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  if (message.role === "user") {
    return <div className="aiMsgText">{message.content}</div>;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const codeBlockRe = /```(\w*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  codeBlockRe.lastIndex = 0;
  let blockIdx = 0;
  while ((match = codeBlockRe.exec(message.content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <div key={`text-${blockIdx}`} className="aiMsgText">
          {renderMarkdown(message.content.slice(lastIndex, match.index))}
        </div>,
      );
    }

    const lang = match[1] || "python";
    const code = match[2].trimEnd();
    const isPython = lang === "python" || lang === "py" || lang === "";

    parts.push(
      <div key={`code-${blockIdx}`} className="aiCodeBlockWrapper">
        <div className="aiCodeBlockHeader">
          <Code2 size={12} />
          <span>{lang || "python"}</span>
          <CopyButton code={code} />
        </div>
        <pre className="aiCodeBlock">
          <code>{code}</code>
        </pre>
        {isPython && !message.isStreaming && (
          <AIDiffPreview
            currentCode={currentCode}
            proposedCode={code}
            onApply={onApply}
            onUndo={onUndo}
            canUndo={canUndo}
          />
        )}
      </div>,
    );

    lastIndex = match.index + match[0].length;
    blockIdx++;
  }

  if (lastIndex < message.content.length) {
    parts.push(
      <div key="text-tail" className="aiMsgText">
        {renderMarkdown(message.content.slice(lastIndex))}
      </div>,
    );
  }

  if (parts.length === 0 && message.isStreaming) {
    parts.push(
      <div key="typing" className="aiTypingDots" aria-label="AI is thinking">
        <span className="aiDot" />
        <span className="aiDot" />
        <span className="aiDot" />
      </div>,
    );
  }

  return <>{parts}</>;
}

export default function AIChatPanel({
  messages,
  isStreaming,
  streamError,
  settings,
  currentCode,
  canUndo,
  onSend,
  onStop,
  onClear,
  onApplyCode,
  onUndoApply,
  onUpdateSettings,
  onClose,
}: Props) {
  const [input, setInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSend(input);
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [input, isStreaming, onSend]);

  function handleKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  const provider = AI_PROVIDERS[settings.provider];
  const hasApiKey = Boolean(settings.apiKey) || settings.provider === "custom";

  return (
    <div className="aiChatPanel">
      <div className="aiChatHeader">
        <div className="aiChatHeaderLeft">
          <Bot size={16} />
          <h3>AI Assistant</h3>
          <span className="aiProviderBadge" title={settings.model}>
            {provider.label}
          </span>
        </div>
        <div className="aiChatHeaderActions">
          <button
            className="aiHeaderBtn"
            onClick={onClear}
            title="Clear chat"
            disabled={messages.length === 0}
          >
            <Trash2 size={14} />
          </button>
          <button
            className="aiHeaderBtn"
            onClick={() => setSettingsOpen(true)}
            title="AI settings"
          >
            <Settings size={14} />
          </button>
          <button className="aiHeaderBtn" onClick={onClose} title="Close AI panel">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="aiChatMessages">
        {!hasApiKey && (
          <div className="aiWelcome">
            <Bot size={32} className="aiWelcomeIcon" />
            <h4>Welcome to DCQ AI Assistant</h4>
            <p>
              Configure your API key to start chatting. Click the{" "}
              <Settings size={12} style={{ verticalAlign: "middle" }} /> settings
              icon above.
            </p>
          </div>
        )}

        {hasApiKey && messages.length === 0 && (
          <div className="aiWelcome">
            <Bot size={32} className="aiWelcomeIcon" />
            <h4>Ask me about CadQuery</h4>
            <p>
              I can help you write, modify, and debug your CadQuery scripts. I can
              see your current code and propose changes you can apply with one
              click.
            </p>
            <div className="aiSuggestions">
              <button
                className="aiSuggestionBtn"
                onClick={() =>
                  onSend("Add a chamfer to all vertical edges of my model")
                }
              >
                Add chamfers to edges
              </button>
              <button
                className="aiSuggestionBtn"
                onClick={() =>
                  onSend("Add a pattern of holes on the top face")
                }
              >
                Add hole pattern
              </button>
              <button
                className="aiSuggestionBtn"
                onClick={() => onSend("Explain what my current code does")}
              >
                Explain my code
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`aiMessage aiMessage--${msg.role}`}
          >
            <div className="aiMsgAvatar">
              {msg.role === "user" ? (
                <User size={14} />
              ) : (
                <Bot size={14} />
              )}
            </div>
            <div className="aiMsgBody">
              <MessageContent
                message={msg}
                currentCode={currentCode}
                onApply={onApplyCode}
                onUndo={onUndoApply}
                canUndo={canUndo}
              />
              <span className="aiMsgTimestamp">{relativeTime(msg.timestamp)}</span>
            </div>
          </div>
        ))}

        {streamError && (
          <div className="aiErrorBanner">
            <span>{streamError}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="aiChatInputArea">
        <div className="aiContextBadge">
          <Code2 size={11} />
          <span>AI has access to your current code</span>
        </div>
        <div className="aiInputRow">
          <textarea
            ref={inputRef}
            className="aiTextarea"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              hasApiKey
                ? "Ask about CadQuery, request code changes..."
                : "Set your API key in settings first"
            }
            disabled={!hasApiKey}
            rows={1}
          />
          {isStreaming ? (
            <button
              className="aiSendBtn aiSendBtn--stop"
              onClick={onStop}
              title="Stop"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              className="aiSendBtn"
              onClick={handleSend}
              disabled={!input.trim() || !hasApiKey}
              title="Send (Enter)"
            >
              <Send size={14} />
            </button>
          )}
        </div>
        <div className="aiInputHint">Enter to send, Shift+Enter for new line</div>
      </div>

      {settingsOpen && (
        <AISettingsModal
          settings={settings}
          onSave={onUpdateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
