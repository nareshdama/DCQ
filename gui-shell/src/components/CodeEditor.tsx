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
    backgroundColor: "transparent"
  },
  ".cm-scroller": {
    fontFamily: '"Cascadia Code", Consolas, monospace',
    lineHeight: "1.55"
  },
  ".cm-content": {
    fontSize: "13px",
    padding: "16px"
  },
  ".cm-gutters": {
    backgroundColor: "rgba(246, 246, 249, 0.96)",
    borderRight: "1px solid rgba(210, 210, 215, 0.7)",
    color: "#8a8a92"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(0, 113, 227, 0.06)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(0, 113, 227, 0.1)"
  },
  ".cm-focused": {
    outline: "none"
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(10, 132, 255, 0.22) !important"
  },
  ".cm-tooltip.cm-tooltip-lint": {
    borderRadius: "12px",
    border: "1px solid rgba(210, 210, 215, 0.9)",
    backgroundColor: "rgba(255, 255, 255, 0.98)",
    boxShadow: "0 12px 28px rgba(0, 0, 0, 0.12)"
  }
});

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
