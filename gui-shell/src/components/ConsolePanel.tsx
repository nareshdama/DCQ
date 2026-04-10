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
              {problemsCount > 0 ? (
                <svg width="10" height="10" viewBox="0 0 10 10" style={{ marginRight: 4 }}>
                  <circle cx="5" cy="5" r="4" fill={problemsCount > 0 ? "#ef4444" : "transparent"} />
                </svg>
              ) : null}
              {`Problems${problemsCount > 0 ? ` (${problemsCount})` : ""}`}
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
              {`Output${outputCount > 0 ? ` (${outputCount})` : ""}`}
            </button>
          </div>
        </div>
        <div className="consoleHeaderActions">
          <button type="button" onClick={onClear} disabled={!canClear} title="Clear console">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
          <button type="button" onClick={onHide} title="Hide console">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <polyline points="2 4 6 8 10 4" />
            </svg>
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
              <p className="muted">No problems detected.</p>
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
                          <span style={{ opacity: 0.6 }}>{`Ln ${diagnostic.line}`}</span>
                          {` ${diagnostic.message}`}
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
                <div className="consoleLabel">stdout</div>
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
