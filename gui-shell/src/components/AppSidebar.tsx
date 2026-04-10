import { type UiStatus } from "../types";

type Props = {
  status: UiStatus;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onRun: () => void;
  onExport: () => void;
  onTogglePalette: () => void;
};

export default function AppSidebar({
  activeTab,
  onTabChange,
  onRun,
  onExport,
  onTogglePalette,
}: Props) {
  return (
    <aside className="appSidebar">
      <div className="sidebarBrand">
        <div className="brandLogo" />
      </div>

      <nav className="sidebarNav">
        <button
          className={`sidebarNavItem ${activeTab === "editor" ? "sidebarNavItem--active" : ""}`}
          onClick={() => onTabChange("editor")}
          title="Editor (Ctrl+R)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </button>
        <button
          className={`sidebarNavItem ${activeTab === "examples" ? "sidebarNavItem--active" : ""}`}
          onClick={() => onTabChange("examples")}
          title="Examples"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </nav>

      <div className="sidebarActions">
        <button className="sidebarActionBtn sidebarActionBtn--primary" onClick={onRun} title="Run Script (Ctrl+R)">
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
        </button>
        <button className="sidebarActionBtn" onClick={onExport} title="Export (Ctrl+E)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button className="sidebarActionBtn" onClick={onTogglePalette} title="Command Palette (Ctrl+P)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
