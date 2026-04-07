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
import ConsolePanel from "./components/ConsolePanel";
import EditorToolbar from "./components/EditorToolbar";
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
      SHELL_LAYOUT.shellChrome
  );
  const safeNext = Number.isFinite(next)
    ? next
    : Math.round(safeViewport * SHELL_LAYOUT.defaultPreviewRatio);

  return Math.max(
    SHELL_LAYOUT.minPreviewWidth,
    Math.min(
      SHELL_LAYOUT.maxPreviewWidth,
      safeViewport - SHELL_LAYOUT.minEditorWidth - SHELL_LAYOUT.shellChrome,
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
  const { examples, loadSelectedExample, selectedExampleFile, setSelectedExampleFile } =
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
  }, []);

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
        viewport - moveEvent.clientX - SHELL_LAYOUT.shellChrome,
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

  return (
    <main className={`shellRoot ${compactMode ? "shellRoot--compact" : ""}`}>
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
            onExport={exportModel}
            onRun={runScriptNow}
            onToggleCompactMode={() => setCompactMode((value) => !value)}
            onToggleLiveMode={() => setLiveMode((value) => !value)}
            onTogglePalette={toggleCommandPalette}
            status={status}
          />
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
                  examples={examples}
                  onExampleChange={handleExampleSelection}
                  onToggleConsole={() => setConsoleOpen((value) => !value)}
                  selectedExampleFile={selectedExampleFile}
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
            <PreviewPanel stlUrl={stlUrl} stepUrl={stepUrl} status={status} />
          </Suspense>
        </section>
      </div>
      {paletteOpen ? (
        <div className="paletteBackdrop" onClick={() => setPaletteOpen(false)}>
          <div className="palette" onClick={(event) => event.stopPropagation()}>
            <h3>Command Palette</h3>
            <button
              onClick={() => {
                runScriptNow();
                setPaletteOpen(false);
              }}
            >
              Run Script
            </button>
            <button
              onClick={() => {
                exportModel();
                setPaletteOpen(false);
              }}
            >
              Export STL + STEP
            </button>
            <button
              onClick={() => {
                setLiveMode((v) => !v);
                setPaletteOpen(false);
              }}
            >
              Toggle Live Mode
            </button>
            <button
              onClick={() => {
                setCompactMode((value) => !value);
                setPaletteOpen(false);
              }}
            >
              Toggle Compact Mode
            </button>
            <button
              onClick={() => {
                setEditorHeaderCollapsed((value) => !value);
                setPaletteOpen(false);
              }}
            >
              {editorHeaderCollapsed ? "Show Code Toolbar" : "Hide Code Toolbar"}
            </button>
            <button
              onClick={() => {
                void loadExampleIntoEditor();
                setPaletteOpen(false);
              }}
            >
              Load Selected Example
            </button>
            <button
              onClick={() => {
                setConsoleOpen(true);
                setPaletteOpen(false);
              }}
            >
              Show Console
            </button>
            <button
              onClick={() => {
                setPaletteOpen(false);
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
