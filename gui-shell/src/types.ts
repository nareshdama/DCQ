export type Diagnostic = {
  line: number;
  message: string;
};

export type ExportFormat = "stl" | "step";

export type RunTrigger = "manual" | "live";

export type StatusTone =
  | "neutral"
  | "info"
  | "progress"
  | "success"
  | "danger";

export type UiStatus = {
  label: string;
  tone: StatusTone;
};

export type RunResponse = {
  ok: boolean;
  stderr: string;
  stdout: string;
  exports?: {
    stl?: string;
    step?: string;
  };
  diagnostics?: Diagnostic[];
};

export type ExampleItem = {
  id: number;
  title: string;
  file: string;
};

export type ExamplesIndexResponse = {
  name: string;
  count: number;
  source?: string;
  examples: ExampleItem[];
};

/* ── Workspace / File System ── */

export type WorkspaceFileInfo = {
  name: string;
  path: string;
  size: number;
  modified: number;
};

export type RecentFileEntry = {
  name: string;
  path: string;
  openedAt: number;
};

export type Project = {
  name: string;
  rootPath: string;
  activeFile: string;
};

export type RecentProjectEntry = {
  name: string;
  rootPath: string;
  openedAt: number;
};

/* ── AI Chat ── */

export type AIProviderKey =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "custom";

export type AISettings = {
  provider: AIProviderKey;
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export type ChatRole = "user" | "assistant" | "system";

export type CodeBlock = {
  code: string;
  language: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  codeBlocks: CodeBlock[];
  timestamp: number;
  isStreaming?: boolean;
};
