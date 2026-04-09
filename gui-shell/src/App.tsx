import {
  Suspense,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FileCode2, FolderOpen } from "lucide-react";
import AppHeader from "./components/AppHeader";
import AppSidebar from "./components/AppSidebar";
import EditorToolbar from "./components/EditorToolbar";
import PanelPlaceholder from "./components/PanelPlaceholder";
import { SHELL_LAYOUT, STORAGE_KEYS } from "./constants";
import { useCadQueryRunner } from "./hooks/useCadQueryRunner";
import { useAIChat } from "./hooks/useAIChat";
import { useExamples } from "./hooks/useExamples";
import { useFileSystem } from "./hooks/useFileSystem";
import { usePersistentState } from "./hooks/usePersistentState";
import type { RecentProjectEntry, WorkspaceFileInfo } from "./types";

const CodeEditor = lazy(() => import("./components/CodeEditor"));
const PreviewPanel = lazy(() => import("./components/PreviewPanel"));
const AIChatPanel = lazy(() => import("./components/AIChatPanel"));
const ConsolePanel = lazy(() => import("./components/ConsolePanel"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
const NewProjectDialog = lazy(() => import("./components/NewProjectDialog"));

const LIVE_DEBOUNCE_MS = 1000;

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent);
const MOD_LABEL = isMac ? "\u2318" : "Ctrl";

function modShortcut(key: string) {
  return `${MOD_LABEL}+${key}`;
}

function clampRightWidth(next: number, viewport = window.innerWidth) {
  const safeViewport = Math.max(
    viewport,
    SHELL_LAYOUT.minEditorWidth +
      SHELL_LAYOUT.minPreviewWidth +
      SHELL_LAYOUT.shellChrome +
      64
  );
  const safeNext = Number.isFinite(next)
    ? next
    : Math.round(safeViewport * SHELL_LAYOUT.defaultPreviewRatio);

  return Math.max(
    SHELL_LAYOUT.minPreviewWidth,
    Math.min(
      SHELL_LAYOUT.maxPreviewWidth,
      safeViewport - SHELL_LAYOUT.minEditorWidth - SHELL_LAYOUT.shellChrome - 64,
      safeNext
    )
  );
}

function clampConsoleHeight(next: number) {
  const safeNext = Number.isFinite(next) ? next : 190;
  return Math.max(
    SHELL_LAYOUT.minConsoleHeight,
    Math.min(SHELL_LAYOUT.maxConsoleHeight, safeNext)
  );
}

export default function App() {
  const [script, setScript] = usePersistentState<string>(
    STORAGE_KEYS.script,
    "",
  );
  const [liveMode, setLiveMode] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("editor");
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [compactMode, setCompactMode] = usePersistentState<boolean>(
    STORAGE_KEYS.compactMode,
    false,
    {
      deserialize: (value) => value === "true",
      serialize: (value) => String(value),
    }
  );
  const [editorHeaderCollapsed, setEditorHeaderCollapsed] =
    usePersistentState<boolean>(STORAGE_KEYS.editorHeaderCollapsed, false, {
      deserialize: (value) => value === "true",
      serialize: (value) => String(value),
    });
  const [rightWidth, setRightWidth] = usePersistentState<number>(
    STORAGE_KEYS.rightWidth,
    () =>
      clampRightWidth(
        Math.round(window.innerWidth * SHELL_LAYOUT.defaultPreviewRatio)
      ),
    {
      deserialize: (value) => clampRightWidth(Number(value)),
      serialize: (value) => String(value),
    }
  );
  const [consoleOpen, setConsoleOpen] = usePersistentState<boolean>(
    STORAGE_KEYS.consoleOpen,
    false,
    {
      deserialize: (value) => value === "true",
      serialize: (value) => String(value),
    }
  );
  const [consoleHeight, setConsoleHeight] = usePersistentState<number>(
    STORAGE_KEYS.consoleHeight,
    190,
    {
      deserialize: (value) => clampConsoleHeight(Number(value)),
      serialize: (value) => String(value),
    }
  );
  const [clearedConsoleKey, setClearedConsoleKey] = useState<string | null>(null);
  const [consoleAutoOpen, setConsoleAutoOpen] = usePersistentState<boolean>(
    STORAGE_KEYS.consoleAutoOpen,
    true,
    {
      deserialize: (value) => value !== "false",
      serialize: (value) => String(value),
    }
  );
  const lastRunIdRef = useRef(0);
  const consoleOpenedForRunRef = useRef(false);
  const liveAbortRef = useRef<AbortController | null>(null);
  const aiTabActive = sidebarTab === "ai";
  const examplesTabActive = sidebarTab === "examples";
  const filesTabActive = sidebarTab === "files";

  const { examples, loadSelectedExample, selectedExampleFile, setSelectedExampleFile } =
    useExamples(examplesTabActive);
  const { diagnostics, execute, status, stderr, stdout, stepUrl, stlUrl, setStatus } =
    useCadQueryRunner(script);

  const fileSystem = useFileSystem(filesTabActive);

  const aiChat = useAIChat(script, setScript, aiTabActive);

  useEffect(() => {
    fileSystem.markContentChanged(script);
  }, [script]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── File operations ── */

  const handleOpenFile = useCallback(async () => {
    const result = await fileSystem.openFile();
    if (result) {
      setScript(result.code);
      fileSystem.markClean(result.code);
    }
  }, [fileSystem, setScript]);

  const handleOpenFolder = useCallback(async () => {
    await fileSystem.openFolder();
    setSidebarTab("files");
  }, [fileSystem]);

  const handleSave = useCallback(async () => {
    await fileSystem.save(script);
  }, [fileSystem, script]);

  const handleSaveAs = useCallback(async () => {
    await fileSystem.saveAs(script);
  }, [fileSystem, script]);

  /* ── Project operations ── */

  const handleNewProject = useCallback(() => {
    if (fileSystem.isDirty) {
      const action = window.confirm(
        "You have unsaved changes. Press OK to save first, or Cancel to discard and continue."
      );
      if (action) {
        void fileSystem.save(script).then(() => {
          setNewProjectDialogOpen(true);
        });
        return;
      }
    }
    setNewProjectDialogOpen(true);
  }, [fileSystem, script]);

  const handleCreateProject = useCallback(
    async (name: string) => {
      setNewProjectDialogOpen(false);
      try {
        const result = await fileSystem.createProject(name);
        setScript(result.code);
        fileSystem.markClean(result.code);
        setSidebarTab("files");
      } catch (err) {
        const msg = (err as Error).message || "Failed to create project";
        window.alert(`Project creation failed:\n${msg}`);
      }
    },
    [fileSystem, setScript]
  );

  const handleOpenProject = useCallback(async () => {
    const result = await fileSystem.openProject();
    if (result) {
      setScript(result.code);
      fileSystem.markClean(result.code);
      setSidebarTab("files");
    }
  }, [fileSystem, setScript]);

  const handleOpenRecentProject = useCallback(
    async (entry: RecentProjectEntry) => {
      const result = await fileSystem.openRecentProject(entry);
      if (result) {
        setScript(result.code);
        fileSystem.markClean(result.code);
        setSidebarTab("files");
      }
    },
    [fileSystem, setScript]
  );

  const handleRenameProject = useCallback(() => {
    const newName = window.prompt("Rename project:", fileSystem.projectName ?? "");
    if (newName && newName.trim()) {
      void fileSystem.renameProject(newName.trim());
    }
  }, [fileSystem]);

  const handleExit = useCallback(async () => {
    const ok = await fileSystem.exitProject(script);
    if (ok) {
      setScript("");
      fileSystem.markClean("");
      setSidebarTab("editor");
    }
  }, [fileSystem, script, setScript]);

  const handleOpenRecent = useCallback(
    async (entry: import("./types").RecentFileEntry) => {
      const result = await fileSystem.openRecent(entry);
      if (result) {
        setScript(result.code);
        fileSystem.markClean(result.code);
      }
    },
    [fileSystem, setScript]
  );

  const handleOpenWorkspaceItem = useCallback(
    async (file: WorkspaceFileInfo) => {
      const result = await fileSystem.openWorkspaceItem(file);
      if (result) {
        setScript(result.code);
        fileSystem.markClean(result.code);
      }
    },
    [fileSystem, setScript]
  );

  const runScriptNow = useCallback(() => {
    lastRunIdRef.current += 1;
    consoleOpenedForRunRef.current = false;
    void execute(["stl"]);
  }, [execute]);

  const exportModel = useCallback(() => {
    lastRunIdRef.current += 1;
    consoleOpenedForRunRef.current = false;
    void execute(["stl", "step"]);
  }, [execute]);

  const toggleCommandPalette = useCallback(() => {
    setPaletteOpen((value) => !value);
  }, []);

  const loadExampleIntoEditor = useCallback(async (fileName?: string) => {
    try {
      setStatus({ label: "Loading example...", tone: "info" });
      const code = await loadSelectedExample(fileName);
      if (!code) {
        setStatus({ label: "Idle", tone: "neutral" });
        return;
      }
      setScript(code);
      setStatus({ label: "Example loaded", tone: "info" });
    } catch (error) {
      setStatus({ label: (error as Error).message, tone: "danger" });
    }
  }, [loadSelectedExample, setStatus, setScript]);

  const handleExampleSelection = useCallback((fileName: string) => {
    setSelectedExampleFile(fileName);
    if (!fileName) {
      return;
    }
    void loadExampleIntoEditor(fileName);
  }, [loadExampleIntoEditor, setSelectedExampleFile]);

  useEffect(() => {
    if (!liveMode || !script.trim()) {
      return;
    }
    liveAbortRef.current?.abort();
    const controller = new AbortController();
    liveAbortRef.current = controller;

    const timer = window.setTimeout(() => {
      if (!controller.signal.aborted) {
        lastRunIdRef.current += 1;
        consoleOpenedForRunRef.current = false;
        void execute(["stl"], "live");
      }
    }, LIVE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [execute, liveMode, script]);

  useEffect(() => {
    function onResize() {
      setRightWidth((current) => clampRightWidth(current));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === "n" && !event.shiftKey) {
        event.preventDefault();
        handleNewProject();
      }
      if (mod && key === "o" && !event.shiftKey) {
        event.preventDefault();
        void handleOpenProject();
      }
      if (mod && key === "o" && event.shiftKey) {
        event.preventDefault();
        void handleOpenFile();
      }
      if (mod && key === "s" && !event.shiftKey) {
        event.preventDefault();
        void handleSave();
      }
      if (mod && key === "s" && event.shiftKey) {
        event.preventDefault();
        void handleSaveAs();
      }
      if (mod && key === "r") {
        event.preventDefault();
        runScriptNow();
      }
      if (mod && key === "e") {
        event.preventDefault();
        exportModel();
      }
      if (mod && key === "k") {
        event.preventDefault();
        setLiveMode((v) => !v);
      }
      if (mod && key === "p") {
        event.preventDefault();
        toggleCommandPalette();
      }
      if (mod && key === "l") {
        event.preventDefault();
        setSidebarTab((prev) => (prev === "ai" ? "editor" : "ai"));
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exportModel, runScriptNow, toggleCommandPalette, handleNewProject, handleOpenProject, handleOpenFile, handleSave, handleSaveAs]);

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const onMove = (moveEvent: PointerEvent) => {
      const viewport = window.innerWidth;
      const next = clampRightWidth(
        viewport - moveEvent.clientX - SHELL_LAYOUT.shellChrome - 64,
        viewport
      );
      setRightWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function handleSplitterKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        setRightWidth((current) =>
          clampRightWidth(current + SHELL_LAYOUT.resizeStep)
        );
        break;
      case "ArrowRight":
        event.preventDefault();
        setRightWidth((current) =>
          clampRightWidth(current - SHELL_LAYOUT.resizeStep)
        );
        break;
      case "Home":
        event.preventDefault();
        setRightWidth(SHELL_LAYOUT.minPreviewWidth);
        break;
      case "End":
        event.preventDefault();
        setRightWidth(clampRightWidth(SHELL_LAYOUT.maxPreviewWidth));
        break;
      default:
        break;
    }
  }

  function beginConsoleResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = consoleHeight;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = startY - moveEvent.clientY;
      setConsoleHeight(clampConsoleHeight(startHeight + delta));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function handleConsoleSplitterKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>
  ) {
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        setConsoleHeight((current) =>
          clampConsoleHeight(current + SHELL_LAYOUT.resizeStep)
        );
        break;
      case "ArrowDown":
        event.preventDefault();
        setConsoleHeight((current) =>
          clampConsoleHeight(current - SHELL_LAYOUT.resizeStep)
        );
        break;
      case "Home":
        event.preventDefault();
        setConsoleHeight(SHELL_LAYOUT.minConsoleHeight);
        break;
      case "End":
        event.preventDefault();
        setConsoleHeight(SHELL_LAYOUT.maxConsoleHeight);
        break;
      default:
        break;
    }
  }

  const consoleContentKey = useMemo(
    () =>
      JSON.stringify({
        stdout,
        stderr,
        diagnostics,
      }),
    [diagnostics, stderr, stdout]
  );
  const consoleCleared = clearedConsoleKey === consoleContentKey;
  const visibleDiagnostics = consoleCleared ? [] : diagnostics;
  const visibleStdout = consoleCleared ? "" : stdout;
  const visibleStderr = consoleCleared ? "" : stderr;
  const hasConsoleErrors =
    visibleDiagnostics.length > 0 || Boolean(visibleStderr.trim());

  useEffect(() => {
    if (hasConsoleErrors && consoleAutoOpen && !consoleOpenedForRunRef.current) {
      consoleOpenedForRunRef.current = true;
      setConsoleOpen(true);
    }
  }, [hasConsoleErrors, consoleAutoOpen, setConsoleOpen]);

  const clearConsole = useCallback(() => {
    setClearedConsoleKey(consoleContentKey);
  }, [consoleContentKey]);

  const commandPaletteActions = useMemo(
    () => [
      {
        id: "new-project",
        title: "New Project",
        shortcut: modShortcut("N"),
        category: "File",
        handler: handleNewProject,
      },
      {
        id: "open-project",
        title: "Open Project\u2026",
        shortcut: modShortcut("O"),
        category: "File",
        handler: () => void handleOpenProject(),
      },
      {
        id: "open-file",
        title: "Open File\u2026",
        shortcut: modShortcut("Shift+O"),
        category: "File",
        handler: () => void handleOpenFile(),
      },
      {
        id: "save-file",
        title: "Save",
        shortcut: modShortcut("S"),
        category: "File",
        handler: () => void handleSave(),
      },
      {
        id: "save-as-file",
        title: "Save As\u2026",
        shortcut: modShortcut("Shift+S"),
        category: "File",
        handler: () => void handleSaveAs(),
      },
      {
        id: "run",
        title: "Run Script",
        shortcut: modShortcut("R"),
        category: "Script",
        handler: runScriptNow,
      },
      {
        id: "export",
        title: "Export STL + STEP",
        shortcut: modShortcut("E"),
        category: "File",
        handler: exportModel,
      },
      {
        id: "toggle-live",
        title: "Toggle Live Mode",
        shortcut: modShortcut("K"),
        category: "Settings",
        handler: () => setLiveMode((v) => !v),
      },
      {
        id: "toggle-compact",
        title: "Toggle Compact Mode",
        category: "View",
        handler: () => setCompactMode((v) => !v),
      },
      {
        id: "toggle-toolbar",
        title: editorHeaderCollapsed ? "Show Code Toolbar" : "Hide Code Toolbar",
        category: "View",
        handler: () => setEditorHeaderCollapsed((v) => !v),
      },
      {
        id: "show-console",
        title: consoleOpen ? "Hide Console" : "Show Console",
        category: "View",
        handler: () => setConsoleOpen((v) => !v),
      },
      {
        id: "find-in-code",
        title: "Find in Code",
        shortcut: modShortcut("F"),
        category: "Editor",
        handler: () => {
          const cmEditor = document.querySelector(".cm-editor .cm-content") as HTMLElement | null;
          cmEditor?.focus();
          document.execCommand("find");
        },
      },
      {
        id: "toggle-auto-open-console",
        title: consoleAutoOpen ? "Disable Console Auto-Open" : "Enable Console Auto-Open",
        category: "Settings",
        handler: () => setConsoleAutoOpen((v) => !v),
      },
      {
        id: "toggle-ai",
        title: sidebarTab === "ai" ? "Hide AI Chat" : "Show AI Chat",
        shortcut: modShortcut("L"),
        category: "AI",
        handler: () => setSidebarTab((prev) => (prev === "ai" ? "editor" : "ai")),
      },
      {
        id: "toggle-examples",
        title: sidebarTab === "examples" ? "Hide Example Library" : "Show Example Library",
        category: "View",
        handler: () => setSidebarTab((prev) => (prev === "examples" ? "editor" : "examples")),
      },
    ],
    [runScriptNow, exportModel, editorHeaderCollapsed, consoleOpen, consoleAutoOpen, sidebarTab, setCompactMode, setEditorHeaderCollapsed, setConsoleOpen, setConsoleAutoOpen, handleNewProject, handleOpenProject, handleOpenFile, handleSave, handleSaveAs]
  );

  return (
    <main className={`shellRoot ${compactMode ? "shellRoot--compact" : ""}`}>
      <AppSidebar
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
        onRun={runScriptNow}
        onExport={exportModel}
        hasWorkspace={Boolean(fileSystem.workspaceRoot)}
        liveMode={liveMode}
        onToggleLiveMode={() => setLiveMode((v) => !v)}
        isDirty={fileSystem.isDirty}
        hasFSAPI={fileSystem.hasFSAPI}
        hasProject={Boolean(fileSystem.projectName)}
        recentProjects={fileSystem.recentProjects}
        onNewProject={handleNewProject}
        onOpenProject={handleOpenProject}
        onOpenFile={handleOpenFile}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onRenameProject={handleRenameProject}
        onExit={handleExit}
        onOpenRecentProject={handleOpenRecentProject}
      />
      
      <div
        className="appRoot"
        style={
          {
            "--right-pane": `${rightWidth}px`
          } as CSSProperties
        }
      >
        <section className="centerPane">
          <AppHeader
            projectName={fileSystem.projectName}
            fileName={fileSystem.fileName}
            isDirty={fileSystem.isDirty}
          />
          
          <div className="mainWorkspace">
            {sidebarTab === "ai" ? (
              <Suspense fallback={null}>
                <AIChatPanel
                  messages={aiChat.messages}
                  isStreaming={aiChat.isStreaming}
                  streamError={aiChat.streamError}
                  settings={aiChat.settings}
                  currentCode={script}
                  canUndo={aiChat.canUndo}
                  onSend={aiChat.sendMessage}
                  onStop={aiChat.stopStreaming}
                  onClear={aiChat.clearHistory}
                  onApplyCode={aiChat.applyCode}
                  onUndoApply={aiChat.undoApply}
                  onUpdateSettings={aiChat.setSettings}
                  onClose={() => setSidebarTab("editor")}
                />
              </Suspense>
            ) : null}

            {sidebarTab === "examples" ? (
              <aside className="examplesSidebar">
                <div className="sidebarHeader">
                  <h3>Example Library</h3>
                  <button
                    type="button"
                    className="sidebarHeaderClose"
                    onClick={() => setSidebarTab("editor")}
                    aria-label="Close example library"
                    title="Close"
                  >
                    &times;
                  </button>
                </div>
                <div className="examplesList">
                  {examples.map((ex) => (
                    <button
                      key={ex.id}
                      className={`exampleItem ${selectedExampleFile === ex.file ? "exampleItem--active" : ""}`}
                      onClick={() => handleExampleSelection(ex.file)}
                    >
                      {ex.title}
                    </button>
                  ))}
                </div>
              </aside>
            ) : null}

            {sidebarTab === "files" ? (
              <aside className="filesSidebar">
                <div className="sidebarHeader">
                  <h3>{fileSystem.projectName ?? fileSystem.workspaceRoot ?? "Files"}</h3>
                  <button
                    type="button"
                    className="sidebarHeaderClose"
                    onClick={() => setSidebarTab("editor")}
                    aria-label="Close files panel"
                    title="Close"
                  >
                    &times;
                  </button>
                </div>
                {fileSystem.workspaceFiles.length === 0 ? (
                  <div className="filesEmpty">
                    <p>No .py files in workspace</p>
                    <button
                      type="button"
                      className="filesOpenBtn"
                      onClick={handleOpenFolder}
                    >
                      <FolderOpen size={14} strokeWidth={1.5} />
                      Open Folder…
                    </button>
                  </div>
                ) : (
                  <div className="filesList">
                    {fileSystem.workspaceFiles.map((f) => (
                      <button
                        key={f.path}
                        className={`filesItem ${fileSystem.filePath === f.path || fileSystem.fileName === f.name ? "filesItem--active" : ""}`}
                        onClick={() => void handleOpenWorkspaceItem(f)}
                      >
                        <FileCode2 size={14} strokeWidth={1.5} />
                        {f.name}
                        <span className="filesItemMeta">
                          {f.size < 1024
                            ? `${f.size} B`
                            : `${(f.size / 1024).toFixed(1)} KB`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </aside>
            ) : null}

            <div className="editorArea">
              <Suspense
                fallback={
                  <PanelPlaceholder
                    className="editorShell paneSection paneSection--editor"
                    title="Code"
                    description="Loading editor..."
                  />
                }
              >
                <CodeEditor
                  value={script}
                  onChange={setScript}
                  diagnostics={diagnostics}
                  headerCollapsed={editorHeaderCollapsed}
                  headerActions={
                    <EditorToolbar
                      consoleOpen={consoleOpen}
                      onToggleConsole={() => setConsoleOpen((value) => !value)}
                    />
                  }
                  onToggleHeader={() => setEditorHeaderCollapsed((value) => !value)}
                />
              </Suspense>
              {consoleOpen ? (
                <>
                  <div
                    className="consoleSplitter"
                    role="separator"
                    aria-label="Resize console panel"
                    aria-orientation="horizontal"
                    aria-valuemin={SHELL_LAYOUT.minConsoleHeight}
                    aria-valuemax={SHELL_LAYOUT.maxConsoleHeight}
                    aria-valuenow={consoleHeight}
                    tabIndex={0}
                    onPointerDown={beginConsoleResize}
                    onKeyDown={handleConsoleSplitterKeyDown}
                  />
                  <Suspense fallback={null}>
                    <ConsolePanel
                      height={consoleHeight}
                      diagnostics={visibleDiagnostics}
                      stdout={visibleStdout}
                      stderr={visibleStderr}
                      onHide={() => setConsoleOpen(false)}
                      onClear={clearConsole}
                      canClear={
                        visibleDiagnostics.length > 0 ||
                        Boolean(visibleStdout?.trim()) ||
                        Boolean(visibleStderr.trim())
                      }
                    />
                  </Suspense>
                </>
              ) : null}
            </div>
          </div>
        </section>
        <div
          className="splitter"
          role="separator"
          aria-label="Resize right panel"
          aria-controls="preview-pane"
          aria-orientation="vertical"
          aria-valuemin={SHELL_LAYOUT.minPreviewWidth}
          aria-valuemax={clampRightWidth(SHELL_LAYOUT.maxPreviewWidth)}
          aria-valuenow={rightWidth}
          tabIndex={0}
          onPointerDown={beginResize}
          onKeyDown={handleSplitterKeyDown}
        />
        <section className="rightPane" id="preview-pane">
          <Suspense
            fallback={
              <PanelPlaceholder
                className="previewShell paneSection paneSection--preview"
                title="Preview"
                description="Loading viewer..."
              />
            }
          >
            <PreviewPanel stlUrl={stlUrl} stepUrl={stepUrl} />
          </Suspense>
        </section>
      </div>
      
      {paletteOpen ? (
        <Suspense fallback={null}>
          <CommandPalette
            actions={commandPaletteActions}
            onClose={() => setPaletteOpen(false)}
          />
        </Suspense>
      ) : null}

      {newProjectDialogOpen ? (
        <Suspense fallback={null}>
          <NewProjectDialog
            onConfirm={handleCreateProject}
            onCancel={() => setNewProjectDialogOpen(false)}
          />
        </Suspense>
      ) : null}
    </main>
  );
}
