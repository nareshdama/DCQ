import { lintGutter, linter } from "@codemirror/lint";
import { python } from "@codemirror/lang-python";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { type ReactNode, useMemo } from "react";
import type { Diagnostic } from "../types";

type Props = {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  headerCollapsed?: boolean;
  headerActions?: ReactNode;
  onToggleHeader?: () => void;
};

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "#E2E2E6",
  },
  ".cm-scroller": {
    fontFamily: '"SFMono-Regular", "Cascadia Code", Consolas, "Liberation Mono", Menlo, monospace',
    lineHeight: "1.65",
  },
  ".cm-content": {
    fontSize: "13px",
    padding: "12px 16px",
    caretColor: "#0A84FF",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid rgba(255, 255, 255, 0.04)",
    color: "#48484A",
    paddingRight: "8px",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    color: "#86868B",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-cursor": {
    borderLeftColor: "#0A84FF",
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(10, 132, 255, 0.25) !important",
  },
  ".cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(10, 132, 255, 0.3) !important",
  },
  ".cm-matchingBracket": {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    outline: "1px solid rgba(255, 255, 255, 0.15)",
  },
  ".cm-tooltip": {
    backgroundColor: "rgba(20, 20, 20, 0.95)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
    color: "#F5F5F7",
  },
  ".cm-tooltip.cm-tooltip-lint": {
    borderRadius: "8px",
    border: "1px solid rgba(255, 69, 58, 0.3)",
    backgroundColor: "rgba(20, 20, 20, 0.95)",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
    color: "#F5F5F7",
  },
  ".cm-tooltip-autocomplete": {
    borderRadius: "8px",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "rgba(10, 132, 255, 0.2)",
    color: "#F5F5F7",
  },
  ".cm-foldGutter span": {
    color: "#48484A",
  },
  ".cm-foldGutter span:hover": {
    color: "#86868B",
  },
}, { dark: true });

export default function CodeEditor({
  value,
  onChange,
  diagnostics,
  headerCollapsed = false,
  headerActions,
  onToggleHeader,
}: Props) {
  const extensions = useMemo(
    () => [
      python(),
      editorTheme,
      lintGutter(),
      linter((view) =>
        diagnostics.map((diagnostic) => {
          const lineNumber = Math.min(
            Math.max(diagnostic.line, 1),
            Math.max(view.state.doc.lines, 1)
          );
          const line = view.state.doc.line(lineNumber);
          return {
            from: line.from,
            to: Math.max(line.from, line.to),
            severity: "error" as const,
            message: diagnostic.message,
          };
        })
      ),
    ],
    [diagnostics]
  );

  return (
    <section className="panel editorShell paneSection paneSection--editor">
      <div
        className={`panelHeader editorPanelHeader ${
          headerCollapsed ? "editorPanelHeader--collapsed" : ""
        }`}
      >
        <div className="editorTitle">
          <h3>Code</h3>
          {headerCollapsed ? null : <span className="muted">Python / CadQuery</span>}
        </div>
        <div className="editorHeaderActions">
          {headerCollapsed ? null : headerActions}
          {onToggleHeader ? (
            <button type="button" className="editorHeaderToggle" onClick={onToggleHeader}>
              {headerCollapsed ? "Show Toolbar" : "Hide Toolbar"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="editorSurface">
        <CodeMirror
          value={value}
          height="100%"
          extensions={extensions}
          onChange={onChange}
          className="codeMirror"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            searchKeymap: true,
          }}
        />
      </div>
    </section>
  );
}
