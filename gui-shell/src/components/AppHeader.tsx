import type { UiStatus } from "../types";

type Props = {
  compactMode: boolean;
  liveMode: boolean;
  onToggleCompactMode: () => void;
  onToggleLiveMode: () => void;
  status: UiStatus;
};

export default function AppHeader({
  compactMode,
  liveMode,
  onToggleCompactMode,
  onToggleLiveMode,
  status,
}: Props) {
  return (
    <header className="topBar">
      <div className="titleBlock">
        <div className="titleRow">
          <h1>DCQ.io</h1>
          <span className={`statusPill statusPill--${status.tone}`}>{status.label}</span>
        </div>
        <p className="muted">Code-first mechanical modeling workspace</p>
      </div>
      <div className="topBarActions">
        <button
          type="button"
          onClick={onToggleLiveMode}
          aria-pressed={liveMode}
          aria-label={liveMode ? "Disable live preview" : "Enable live preview"}
        >
          {liveMode ? "Live: On" : "Live: Off"}
        </button>
        <button
          type="button"
          onClick={onToggleCompactMode}
          aria-pressed={compactMode}
          aria-label={compactMode ? "Switch to cozy density" : "Switch to compact density"}
        >
          {compactMode ? "Density: Compact" : "Density: Cozy"}
        </button>
      </div>
    </header>
  );
}
