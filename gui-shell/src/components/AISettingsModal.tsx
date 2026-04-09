import { useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { AI_PROVIDERS, PROVIDER_KEYS } from "../ai-providers";
import type { AIProviderKey, AISettings } from "../types";

type Props = {
  settings: AISettings;
  onSave: (settings: AISettings) => void;
  onClose: () => void;
};

export default function AISettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AISettings>({ ...settings });
  const provider = AI_PROVIDERS[draft.provider];

  function handleProviderChange(key: AIProviderKey) {
    const def = AI_PROVIDERS[key];
    setDraft((prev) => ({
      ...prev,
      provider: key,
      model: def.defaultModel || prev.model,
      baseUrl: undefined,
    }));
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  return (
    <div className="aiSettingsBackdrop" onClick={onClose}>
      <div className="aiSettingsModal" onClick={(e) => e.stopPropagation()}>
        <div className="aiSettingsHeader">
          <h2>AI Settings</h2>
          <button
            className="aiSettingsClose"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="aiSettingsBody">
          <label className="aiField">
            <span className="aiFieldLabel">Provider</span>
            <select
              className="aiSelect"
              value={draft.provider}
              onChange={(e) =>
                handleProviderChange(e.target.value as AIProviderKey)
              }
            >
              {PROVIDER_KEYS.map((key) => (
                <option key={key} value={key}>
                  {AI_PROVIDERS[key].label}
                </option>
              ))}
            </select>
          </label>

          <label className="aiField">
            <span className="aiFieldLabel">
              API Key
              {provider.apiKeyUrl && (
                <a
                  href={provider.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aiFieldLink"
                  title="Get API key"
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </span>
            <input
              className="aiInput"
              type="password"
              placeholder={provider.apiKeyPlaceholder}
              value={draft.apiKey}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, apiKey: e.target.value }))
              }
              autoComplete="off"
            />
          </label>

          <label className="aiField">
            <span className="aiFieldLabel">Model</span>
            {provider.models.length > 0 ? (
              <select
                className="aiSelect"
                value={draft.model}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, model: e.target.value }))
                }
              >
                {provider.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="aiInput"
                type="text"
                placeholder="Model name"
                value={draft.model}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, model: e.target.value }))
                }
              />
            )}
          </label>

          <label className="aiField">
            <span className="aiFieldLabel">Base URL (optional override)</span>
            <input
              className="aiInput"
              type="text"
              placeholder={provider.defaultBaseUrl}
              value={draft.baseUrl ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  baseUrl: e.target.value || undefined,
                }))
              }
            />
          </label>
        </div>

        <div className="aiSettingsFooter">
          <button className="aiBtn aiBtn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="aiBtn aiBtn--primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
