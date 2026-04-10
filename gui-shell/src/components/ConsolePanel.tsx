import { useEffect, useRef, useState } from "react";
import type { Diagnostic, UiStatus } from "../types";

const CONSOLE_TAB_STORAGE_KEY = "cq-console-tab-v1";

type ConsoleTab = "problems" | "output";

type Props = {
  height: number;
  status: UiStatus;
  diagnostics: Diagnostic[];
  stdout?: string;
  stderr?: string;
  canClear: boolean;
  onClear: () => void;
  onHide: () => void;
};

export default function ConsolePanel({
  height,
  status,
  diagnostics,
  stdout,
  stderr,
  canClear,
  onClear,
  onHide,
}: Props) {
  const hasStdout = Boolean(stdout?.trim());
  const hasStderr = Boolean(stderr?.trim());
  const hasDiagnostics = diagnostics.length > 0;
  const problemsCount = diagnostics.length + (hasStderr ? 1 : 0);
  const outputCount = hasStdout ? 1 : 0;
  const [activeTab, setActiveTab] = useState<ConsoleTab>(() => {
    const saved =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(CONSOLE_TAB_STORAGE_KEY);
    return saved === "output" ? "output" : "problems";
  });
  const previousProblemCountRef = useRef<number | null>(null);

  useEffect(() => {
    window.localStorage.setItem(CONSOLE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    const prev = previousProblemCountRef.current;
    if (problemsCount > 0 && (prev === null || prev === 0)) {
      setActiveTab("problems");
    }
    if (problemsCount === 0 && outputCount > 0 && activeTab === "problems") {
      setActiveTab("output");
    }
    previousProblemCountRef.current = problemsCount;
  }, [activeTab, outputCount, problemsCount]);

  return (
    <section className="panel consoleShell paneSection paneSection--console" style={{ height }}>
      <div className="panelHeader">
        <div className="consoleHeaderTitle">
          <h3>Console</h3>
          <div className="consoleTabs" role="tablist" aria-label="Console views">
            <button
              type="button"
              role="tab"
              id="console-tab-problems"
              aria-controls="console-panel-problems"
              aria-selected={activeTab === "problems"}
              className={`consoleTab ${
                activeTab === "problems" ? "consoleTab--active" : ""
              }`}
              onClick={() => setActiveTab("problems")}
            >
              {`Problems (${problemsCount})`}
            </button>
            <button
              type="button"
              role="tab"
              id="console-tab-output"
              aria-controls="console-panel-output"
              aria-selected={activeTab === "output"}
              className={`consoleTab ${
                activeTab === "output" ? "consoleTab--active" : ""
              }`}
              onClick={() => setActiveTab("output")}
            >
              {`Output (${outputCount})`}
            </button>
          </div>
        </div>
        <div className="consoleHeaderActions">
          <span className={`statusPill statusPill--compact statusPill--${status.tone}`}>
            {status.label}
          </span>
          <button type="button" onClick={onClear} disabled={!canClear}>
            Clear
          </button>
          <button type="button" onClick={onHide}>
            Hide
          </button>
        </div>
      </div>
      <div className="consoleBody">
        {activeTab === "problems" ? (
          <div
            id="console-panel-problems"
            role="tabpanel"
            aria-labelledby="console-tab-problems"
            className="consoleSection"
          >
            {problemsCount === 0 ? (
              <p className="muted">No problems in the latest run.</p>
            ) : (
              <>
                {hasDiagnostics ? (
                  <div className="consoleSection">
                    <div className="consoleLabel">Diagnostics</div>
                    <div className="consoleList">
                      {diagnostics.map((diagnostic, index) => (
                        <div
                          key={`${diagnostic.line}-${index}`}
                          className="consoleEntry consoleEntry--error"
                        >
                          {`Line ${diagnostic.line}: ${diagnostic.message}`}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {hasStderr ? (
                  <div className="consoleSection">
                    <div className="consoleLabel">Errors</div>
                    <pre className="consoleBlock consoleBlock--error">{stderr}</pre>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div
            id="console-panel-output"
            role="tabpanel"
            aria-labelledby="console-tab-output"
            className="consoleSection"
          >
            {hasStdout ? (
              <>
                <div className="consoleLabel">Output</div>
                <pre className="consoleBlock">{stdout}</pre>
              </>
            ) : (
              <p className="muted">No output from the latest run.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
