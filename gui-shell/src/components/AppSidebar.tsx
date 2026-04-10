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
  status,
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
        <span className="brandName">DCQ</span>
      </div>
      
      <nav className="sidebarNav">
        <button
          className={`sidebarNavItem ${activeTab === "editor" ? "sidebarNavItem--active" : ""}`}
          onClick={() => onTabChange("editor")}
          title="Editor (Ctrl+R)"
        >
          <div className="sidebarIcon editorIcon" />
          <span>Editor</span>
        </button>
        <button
          className={`sidebarNavItem ${activeTab === "examples" ? "sidebarNavItem--active" : ""}`}
          onClick={() => onTabChange("examples")}
          title="Examples"
        >
          <div className="sidebarIcon examplesIcon" />
          <span>Examples</span>
        </button>
      </nav>

      <div className="sidebarActions">
        <button
          className="sidebarActionBtn sidebarActionBtn--primary"
          onClick={onRun}
          title="Run Script (Ctrl+R)"
          aria-label="Run script"
        >
          Run
        </button>
        <button
          className="sidebarActionBtn"
          onClick={onExport}
          title="Export STL + STEP (Ctrl+E)"
          aria-label="Export STL and STEP"
        >
          Export
        </button>
        <button
          className="sidebarActionBtn"
          onClick={onTogglePalette}
          title="Command Palette (Ctrl+P)"
          aria-label="Open command palette"
        >
          Commands
        </button>
      </div>

      <div className="sidebarFooter">
        <div className={`sidebarStatus statusPill statusPill--compact statusPill--${status.tone}`}>
          {status.label}
        </div>
      </div>
    </aside>
  );
}
