import {
  Suspense,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import AppHeader from "./components/AppHeader";
import AppSidebar from "./components/AppSidebar";
import ConsolePanel from "./components/ConsolePanel";
import CommandPalette from "./components/CommandPalette";
import EditorToolbar from "./components/EditorToolbar";
import ErrorBoundary from "./components/ErrorBoundary";
import PanelPlaceholder from "./components/PanelPlaceholder";
import { SHELL_LAYOUT, STARTER_SCRIPT, STORAGE_KEYS } from "./constants";
import { useCadQueryRunner } from "./hooks/useCadQueryRunner";
import { useExamples } from "./hooks/useExamples";
import { usePersistentState } from "./hooks/usePersistentState";

const CodeEditor = lazy(() => import("./components/CodeEditor"));
const PreviewPanel = lazy(() => import("./components/PreviewPanel"));

function clampRightWidth(next: number, viewport = window.innerWidth) {
  const safeViewport = Math.max(
    viewport,
    SHELL_LAYOUT.minEditorWidth +
      SHELL_LAYOUT.minPreviewWidth +
      SHELL_LAYOUT.shellChrome +
      64 // sidebar width
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
  const [script, setScript] = useState(STARTER_SCRIPT);
  const [liveMode, setLiveMode] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("editor");
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
  const { examples, examplesError, examplesLoading, loadSelectedExample, selectedExampleFile, setSelectedExampleFile } =
    useExamples();
  const { diagnostics, execute, status, stderr, stdout, stepUrl, stlUrl, setStatus } =
    useCadQueryRunner(script);

  const runScriptNow = useCallback(() => {
    void execute(["stl"]);
  }, [execute]);

  const exportModel = useCallback(() => {
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
      setSidebarTab("editor");
    } catch (error) {
      setStatus({ label: (error as Error).message, tone: "danger" });
    }
  }, [loadSelectedExample, setStatus]);

  const handleExampleSelection = useCallback((fileName: string) => {
    setSelectedExampleFile(fileName);
    if (!fileName) {
      return;
    }
    void loadExampleIntoEditor(fileName);
  }, [loadExampleIntoEditor, setSelectedExampleFile]);

  useEffect(() => {
    if (!liveMode) {
      return;
    }
    const timer = window.setTimeout(() => {
      void execute(["stl"], "live");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [execute, liveMode]);

  useEffect(() => {
    function onResize() {
      setRightWidth((current) => clampRightWidth(current));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setRightWidth]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        runScriptNow();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        exportModel();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLiveMode((v) => !v);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        toggleCommandPalette();
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exportModel, runScriptNow, toggleCommandPalette]);

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
    if (hasConsoleErrors) {
      setConsoleOpen(true);
    }
  }, [hasConsoleErrors, setConsoleOpen]);

  const clearConsole = useCallback(() => {
    setClearedConsoleKey(consoleContentKey);
  }, [consoleContentKey]);

  const commandPaletteActions = useMemo(
    () => [
      {
        id: "run",
        title: "Run Script",
        shortcut: "Ctrl+R",
        category: "Script",
        handler: runScriptNow,
      },
      {
        id: "export",
        title: "Export STL + STEP",
        shortcut: "Ctrl+E",
        category: "File",
        handler: exportModel,
      },
      {
        id: "toggle-live",
        title: "Toggle Live Mode",
        shortcut: "Ctrl+K",
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
        title: "Show Console",
        category: "View",
        handler: () => setConsoleOpen(true),
      },
    ],
    [runScriptNow, exportModel, editorHeaderCollapsed, setCompactMode, setEditorHeaderCollapsed, setConsoleOpen]
  );

  return (
    <main className={`shellRoot ${compactMode ? "shellRoot--compact" : ""}`}>
      <AppSidebar
        status={status}
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
        onRun={runScriptNow}
        onExport={exportModel}
        onTogglePalette={toggleCommandPalette}
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
            compactMode={compactMode}
            liveMode={liveMode}
            onToggleCompactMode={() => setCompactMode((value) => !value)}
            onToggleLiveMode={() => setLiveMode((value) => !value)}
            status={status}
          />
          
          <div className="mainWorkspace">
            {sidebarTab === "examples" ? (
              <aside className="examplesSidebar">
                <div className="sidebarHeader">
                  <h3>Example Library</h3>
                </div>
                <div className="examplesList">
                  {examplesLoading ? (
                    <p className="muted examplesMuted">Loading examples…</p>
                  ) : examplesError ? (
                    <p className="muted examplesMuted">{examplesError}</p>
                  ) : examples.length === 0 ? (
                    <p className="muted examplesMuted">No examples found.</p>
                  ) : examples.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      className={`exampleItem ${selectedExampleFile === ex.file ? "exampleItem--active" : ""}`}
                      onClick={() => handleExampleSelection(ex.file)}
                    >
                      {ex.title}
                    </button>
                  ))}
                </div>
              </aside>
            ) : null}

            <div className="editorArea">
              <ErrorBoundary
                fallback={
                  <PanelPlaceholder
                    className="editorShell paneSection paneSection--editor"
                    title="Code"
                    description="Editor failed to load. Please refresh."
                  />
                }
              >
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
              </ErrorBoundary>
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
                  <ConsolePanel
                    height={consoleHeight}
                    status={status}
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
          <ErrorBoundary
            fallback={
              <PanelPlaceholder
                className="previewShell paneSection paneSection--preview"
                title="Preview"
                description="3D viewer failed to load. Please refresh."
              />
            }
          >
          <Suspense
            fallback={
              <PanelPlaceholder
                className="previewShell paneSection paneSection--preview"
                title="Preview"
                description="Loading viewer..."
              />
            }
          >
            <PreviewPanel stlUrl={stlUrl} stepUrl={stepUrl} status={status} />
          </Suspense>
          </ErrorBoundary>
        </section>
      </div>
      
      {paletteOpen ? (
        <CommandPalette
          actions={commandPaletteActions}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}
    </main>
  );
}
