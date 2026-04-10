import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, X, AlertTriangle, AlertCircle, Info, FileText, Copy, Check } from "lucide-react";
import type { Diagnostic, DiagnosticSeverity } from "../types";

const CONSOLE_TAB_STORAGE_KEY = "cq-console-tab-v1";

type ConsoleTab = "problems" | "output";

type Props = {
  height: number;
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
  const previousProblemCountRef = useRef(problemsCount);
  const [copied, setCopied] = useState(false);

  const copyConsoleContent = useCallback(() => {
    let text = "";
    if (activeTab === "problems") {
      const diagLines = diagnostics.map((d) => `Line ${d.line}: ${d.message}`);
      text = [...diagLines, stderr ?? ""].filter(Boolean).join("\n");
    } else {
      text = stdout ?? "";
    }
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [activeTab, diagnostics, stderr, stdout]);

  useEffect(() => {
    window.localStorage.setItem(CONSOLE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (problemsCount > 0 && previousProblemCountRef.current === 0) {
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
              <AlertTriangle size={11} strokeWidth={2} />
              {` Problems (${problemsCount})`}
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
              <FileText size={11} strokeWidth={2} />
              {` Output (${outputCount})`}
            </button>
          </div>
        </div>
        <div className="consoleHeaderActions">
          <button
            type="button"
            onClick={copyConsoleContent}
            title="Copy to clipboard"
            aria-label="Copy console output"
          >
            {copied ? <Check size={13} strokeWidth={1.5} /> : <Copy size={13} strokeWidth={1.5} />}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!canClear}
            title="Clear console"
            aria-label="Clear console"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onHide}
            title="Hide console"
            aria-label="Hide console"
          >
            <X size={13} strokeWidth={1.5} />
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
                      {diagnostics.map((diagnostic, index) => {
                        const severity = diagnostic.severity ?? "error";
                        const SeverityIcon =
                          severity === "warning"
                            ? AlertTriangle
                            : severity === "info"
                              ? Info
                              : AlertCircle;
                        return (
                          <div
                            key={`${diagnostic.line}-${index}`}
                            className={`consoleEntry consoleEntry--${severity}`}
                          >
                            <SeverityIcon
                              size={12}
                              strokeWidth={2}
                              style={{ flexShrink: 0, marginTop: 2 }}
                            />
                            <span>
                              {`Line ${diagnostic.line}: ${diagnostic.message}`}
                              {diagnostic.detail ? (
                                <span className="consoleDiagnosticDetail">
                                  {` — ${diagnostic.detail}`}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        );
                      })}
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
