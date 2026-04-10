import type { UiStatus } from "../types";

type Props = {
  compactMode: boolean;
  liveMode: boolean;
  onExport: () => void;
  onRun: () => void;
  onToggleCompactMode: () => void;
  onToggleLiveMode: () => void;
  onTogglePalette: () => void;
  status: UiStatus;
};

export default function AppHeader({
  liveMode,
  onExport,
  onRun,
  onToggleCompactMode,
  onToggleLiveMode,
  onTogglePalette,
  status,
}: Props) {
  return (
    <header className="topBar">
      <div className="titleBlock">
        <div className="titleRow">
          <h1>DCQ.io</h1>
          <span className={`statusPill statusPill--${status.tone}`}>{status.label}</span>
        </div>
      </div>
      <div className="topBarActions">
        <button
          type="button"
          className={`toolBtn ${liveMode ? "toolBtn--active" : ""}`}
          onClick={onToggleLiveMode}
          title="Toggle live preview (Ctrl+K)"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="4" fill={liveMode ? "#4ade80" : "#6b6f7e"} />
          </svg>
          {liveMode ? "Live" : "Paused"}
        </button>
        <span className="toolBtn--separator" />
        <button type="button" className="toolBtn" onClick={onToggleCompactMode} title="Toggle density">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="1" y1="3" x2="11" y2="3" />
            <line x1="1" y1="6" x2="11" y2="6" />
            <line x1="1" y1="9" x2="11" y2="9" />
          </svg>
          Density
        </button>
        <button type="button" className="toolBtn" onClick={onTogglePalette} title="Command Palette (Ctrl+P)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="5" cy="5" r="3.5" />
            <line x1="8" y1="8" x2="11" y2="11" />
          </svg>
          Commands
        </button>
        <span className="toolBtn--separator" />
        <button type="button" className="toolBtn toolBtn--primary" onClick={onRun} title="Run (Ctrl+R)">
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
            <polygon points="0 0 10 6 0 12" />
          </svg>
          Run
        </button>
        <button type="button" className="toolBtn" onClick={onExport} title="Export (Ctrl+E)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <path d="M10 7.5v2.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5" />
            <polyline points="4 5 6 7.5 8 5" />
            <line x1="6" y1="7.5" x2="6" y2="1" />
          </svg>
          Export
        </button>
      </div>
    </header>
  );
}
