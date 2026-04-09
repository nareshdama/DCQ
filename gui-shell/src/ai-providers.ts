import type { AIProviderKey, AISettings } from "./types";

export type ProviderDefinition = {
  key: AIProviderKey;
  label: string;
  defaultBaseUrl: string;
  models: string[];
  defaultModel: string;
  apiKeyPlaceholder: string;
  apiKeyUrl: string;
};

export const AI_PROVIDERS: Record<AIProviderKey, ProviderDefinition> = {
  openai: {
    key: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    models: [
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-4o",
      "gpt-4o-mini",
      "o4-mini",
      "o3-mini",
    ],
    defaultModel: "gpt-4.1-mini",
    apiKeyPlaceholder: "sk-...",
    apiKeyUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    key: "anthropic",
    label: "Anthropic (Claude)",
    defaultBaseUrl: "https://api.anthropic.com",
    models: [
      "claude-sonnet-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-haiku-20240307",
    ],
    defaultModel: "claude-sonnet-4-20250514",
    apiKeyPlaceholder: "sk-ant-...",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
  },
  gemini: {
    key: "gemini",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ],
    defaultModel: "gemini-2.5-flash",
    apiKeyPlaceholder: "AIza...",
    apiKeyUrl: "https://aistudio.google.com/apikey",
  },
  openrouter: {
    key: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    models: [
      "qwen/qwen3-coder:free",
      "anthropic/claude-sonnet-4",
      "openai/gpt-4.1",
      "openai/gpt-4.1-mini",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "deepseek/deepseek-chat-v3",
      "meta-llama/llama-4-maverick",
    ],
    defaultModel: "anthropic/claude-sonnet-4",
    apiKeyPlaceholder: "sk-or-...",
    apiKeyUrl: "https://openrouter.ai/keys",
  },
  custom: {
    key: "custom",
    label: "Custom (OpenAI-compatible)",
    defaultBaseUrl: "http://localhost:11434/v1",
    models: [],
    defaultModel: "",
    apiKeyPlaceholder: "API key (if required)",
    apiKeyUrl: "",
  },
};

export const PROVIDER_KEYS = Object.keys(AI_PROVIDERS) as AIProviderKey[];

export function getDefaultSettings(): AISettings {
  return {
    provider: "openai",
    apiKey: "",
    model: AI_PROVIDERS.openai.defaultModel,
  };
}
