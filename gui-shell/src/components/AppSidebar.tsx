import { FileText, Code2, Library, Play, Download, Bot, FolderOpen, Zap, Layers } from "lucide-react";
import { useState } from "react";
import type { RecentProjectEntry } from "../types";
import FileMenu from "./FileMenu";

type Props = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onRun: () => void;
  onExport: () => void;
  hasWorkspace: boolean;
  liveMode: boolean;
  onToggleLiveMode: () => void;
  isDirty: boolean;
  hasFSAPI: boolean;
  hasProject: boolean;
  recentProjects: RecentProjectEntry[];
  onNewProject: () => void;
  onOpenProject: () => void;
  onOpenFile: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onRenameProject: () => void;
  onExit: () => void;
  onOpenRecentProject: (entry: RecentProjectEntry) => void;
  sceneObjectCount: number;
};

export default function AppSidebar({
  activeTab,
  onTabChange,
  onRun,
  onExport,
  hasWorkspace,
  liveMode,
  onToggleLiveMode,
  isDirty,
  hasFSAPI,
  hasProject,
  recentProjects,
  onNewProject,
  onOpenProject,
  onOpenFile,
  onSave,
  onSaveAs,
  onRenameProject,
  onExit,
  onOpenRecentProject,
  sceneObjectCount,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <aside className="appSidebar" aria-label="Main navigation">
      <div className="sidebarFileAnchor">
        <button
          type="button"
          className={`sidebarFileBtn ${menuOpen ? "sidebarFileBtn--active" : ""}`}
          onClick={() => setMenuOpen((v) => !v)}
          title="File menu"
          aria-label="File menu"
          aria-expanded={menuOpen}
        >
          <FileText size={18} strokeWidth={1.5} />
          {isDirty ? <span className="sidebarFileBtnDirty" /> : null}
        </button>
        {menuOpen ? (
          <FileMenu
            onNewProject={onNewProject}
            onOpenProject={onOpenProject}
            onOpenFile={onOpenFile}
            onSave={onSave}
            onSaveAs={onSaveAs}
            onRenameProject={onRenameProject}
            onExit={onExit}
            onOpenRecentProject={onOpenRecentProject}
            onClose={() => setMenuOpen(false)}
            recentProjects={recentProjects}
            hasFSAPI={hasFSAPI}
            isDirty={isDirty}
            hasProject={hasProject}
          />
        ) : null}
      </div>

      <nav className="sidebarNav" aria-label="Workspace">
        <button
          className={`sidebarNavItem ${activeTab === "editor" ? "sidebarNavItem--active" : ""}`}
          onClick={() => onTabChange("editor")}
          aria-label="Editor"
          title="Editor"
        >
          <Code2 className="sidebarIcon" size={20} strokeWidth={1.5} />
          <span>Editor</span>
        </button>
        {hasWorkspace ? (
          <button
            className={`sidebarNavItem ${activeTab === "files" ? "sidebarNavItem--active" : ""}`}
            onClick={() => onTabChange("files")}
            aria-label="Files"
            title="Workspace Files"
          >
            <FolderOpen className="sidebarIcon" size={20} strokeWidth={1.5} />
            <span>Files</span>
          </button>
        ) : null}
        <button
          className={`sidebarNavItem ${activeTab === "examples" ? "sidebarNavItem--active" : ""}`}
          onClick={() => onTabChange("examples")}
          aria-label="Example library"
          title="Example Library"
        >
          <Library className="sidebarIcon" size={20} strokeWidth={1.5} />
          <span>Library</span>
        </button>
        <button
          className={`sidebarNavItem ${activeTab === "ai" ? "sidebarNavItem--active" : ""}`}
          onClick={() => onTabChange("ai")}
          aria-label="AI assistant"
          title="AI Assistant (Ctrl+L)"
        >
          <Bot className="sidebarIcon" size={20} strokeWidth={1.5} />
          <span>AI</span>
        </button>
        <button
          className={`sidebarNavItem ${activeTab === "scene" ? "sidebarNavItem--active" : ""}`}
          onClick={() => onTabChange("scene")}
          aria-label="Scene tree"
          title="Scene Tree"
        >
          <Layers className="sidebarIcon" size={20} strokeWidth={1.5} />
          <span>Scene</span>
          {sceneObjectCount > 1 ? (
            <span className="sidebarNavBadge">{sceneObjectCount}</span>
          ) : null}
        </button>
      </nav>

      <div className="sidebarActions">
        <button
          className={`sidebarActionBtn sidebarActionBtn--live ${liveMode ? "sidebarActionBtn--liveOn" : ""}`}
          onClick={onToggleLiveMode}
          aria-label={liveMode ? "Disable live mode" : "Enable live mode"}
          aria-pressed={liveMode}
          title={liveMode ? "Live Mode ON (Ctrl+K)" : "Live Mode OFF (Ctrl+K)"}
        >
          <Zap size={14} strokeWidth={2} />
        </button>
        <button
          className="sidebarActionBtn sidebarActionBtn--primary"
          onClick={onRun}
          aria-label="Run script"
          title="Run Script (Ctrl+R)"
        >
          <Play size={16} strokeWidth={2} />
        </button>
        <button
          className="sidebarActionBtn"
          onClick={onExport}
          aria-label="Export models"
          title="Export (Ctrl+E)"
        >
          <Download size={16} strokeWidth={1.5} />
        </button>
      </div>
    </aside>
  );
}
