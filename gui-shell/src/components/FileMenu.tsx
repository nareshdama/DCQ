import {
  FolderPlus,
  FolderOpen,
  FileInput,
  Save,
  SaveAll,
  Clock,
  LogOut,
  Pencil,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { RecentProjectEntry } from "../types";

type FileMenuAction = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  hidden?: boolean;
  handler: () => void;
};

type Props = {
  onNewProject: () => void;
  onOpenProject: () => void;
  onOpenFile: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onRenameProject: () => void;
  onExit: () => void;
  onOpenRecentProject: (entry: RecentProjectEntry) => void;
  onClose: () => void;
  recentProjects: RecentProjectEntry[];
  hasFSAPI: boolean;
  isDirty: boolean;
  hasProject: boolean;
};

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.userAgent);
const MOD = isMac ? "\u2318" : "Ctrl";

export default function FileMenu({
  onNewProject,
  onOpenProject,
  onOpenFile,
  onSave,
  onSaveAs,
  onRenameProject,
  onExit,
  onOpenRecentProject,
  onClose,
  recentProjects,
  hasFSAPI,
  isDirty,
  hasProject,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const actions: (FileMenuAction | "separator")[] = [
    {
      id: "new-project",
      label: "New Project",
      icon: <FolderPlus size={14} strokeWidth={1.5} />,
      shortcut: `${MOD}+N`,
      handler: () => {
        onNewProject();
        onClose();
      },
    },
    {
      id: "open-project",
      label: "Open Project\u2026",
      icon: <FolderOpen size={14} strokeWidth={1.5} />,
      shortcut: `${MOD}+O`,
      hidden: !hasFSAPI,
      handler: () => {
        onOpenProject();
        onClose();
      },
    },
    {
      id: "open-file",
      label: "Open File\u2026",
      icon: <FileInput size={14} strokeWidth={1.5} />,
      shortcut: `${MOD}+Shift+O`,
      handler: () => {
        onOpenFile();
        onClose();
      },
    },
    "separator",
    {
      id: "save",
      label: "Save",
      icon: <Save size={14} strokeWidth={1.5} />,
      shortcut: `${MOD}+S`,
      handler: () => {
        onSave();
        onClose();
      },
    },
    {
      id: "save-as",
      label: "Save As\u2026",
      icon: <SaveAll size={14} strokeWidth={1.5} />,
      shortcut: `${MOD}+Shift+S`,
      handler: () => {
        onSaveAs();
        onClose();
      },
    },
    "separator",
    {
      id: "rename-project",
      label: "Rename Project\u2026",
      icon: <Pencil size={14} strokeWidth={1.5} />,
      hidden: !hasProject,
      handler: () => {
        onRenameProject();
        onClose();
      },
    },
    "separator",
    {
      id: "exit",
      label: hasProject
        ? "Close Project"
        : isDirty
          ? "Discard & Close"
          : "Close File",
      icon: <LogOut size={14} strokeWidth={1.5} />,
      handler: () => {
        onExit();
        onClose();
      },
    },
  ];

  return (
    <>
      <div className="fileMenuBackdrop" onClick={onClose} />
      <div className="fileMenu fileMenu--flyout" ref={menuRef} role="menu">
        {actions.map((action, i) => {
          if (action === "separator") {
            return <div key={`sep-${i}`} className="fileMenuItem--separator" role="separator" />;
          }
          if (action.hidden) return null;
          return (
            <button
              key={action.id}
              className={`fileMenuItem ${action.disabled ? "fileMenuItem--disabled" : ""}`}
              role="menuitem"
              onClick={action.handler}
              disabled={action.disabled}
            >
              <span className="fileMenuItemLabel">
                {action.icon}
                {action.label}
              </span>
              {action.shortcut ? (
                <span className="fileMenuItemShortcut">{action.shortcut}</span>
              ) : null}
            </button>
          );
        })}

        {recentProjects.length > 0 ? (
          <>
            <div className="fileMenuItem--separator" role="separator" />
            <div className="fileMenuSubmenuLabel">
              <Clock size={10} strokeWidth={1.5} style={{ marginRight: 4, verticalAlign: "middle" }} />
              Recent Projects
            </div>
            <div className="fileMenuSubmenu">
              {recentProjects.map((entry) => (
                <button
                  key={entry.rootPath}
                  className="fileMenuItem"
                  role="menuitem"
                  onClick={() => {
                    onOpenRecentProject(entry);
                    onClose();
                  }}
                >
                  <span className="fileMenuItemLabel">{entry.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
