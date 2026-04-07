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
  compactMode,
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
        <p className="muted">Code-first mechanical modeling workspace</p>
      </div>
      <div className="topBarActions">
        <button type="button" onClick={onToggleLiveMode}>
          {liveMode ? "Live: On" : "Live: Off"}
        </button>
        <button type="button" onClick={onToggleCompactMode}>
          {compactMode ? "Density: Compact" : "Density: Cozy"}
        </button>
        <button type="button" onClick={onTogglePalette}>
          Command
        </button>
        <button type="button" className="btnPrimary" onClick={onRun}>
          Run
        </button>
        <button type="button" onClick={onExport}>
          Export
        </button>
      </div>
    </header>
  );
}
