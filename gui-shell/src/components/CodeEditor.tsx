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
    backgroundColor: "#13141a",
  },
  ".cm-scroller": {
    fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
    lineHeight: "1.6",
    fontSize: "13px",
  },
  ".cm-content": {
    padding: "8px 0",
    caretColor: "#3b8eed",
  },
  ".cm-gutters": {
    backgroundColor: "#13141a",
    borderRight: "1px solid rgba(255, 255, 255, 0.06)",
    color: "#4a4d5a",
    minWidth: "48px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 12px",
    fontSize: "11px",
    fontFamily: '"Cascadia Code", "JetBrains Mono", monospace',
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(59, 142, 237, 0.06)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(59, 142, 237, 0.08)",
    color: "#9da1b0",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-cursor": {
    borderLeftColor: "#3b8eed",
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(59, 142, 237, 0.25) !important",
  },
  ".cm-matchingBracket": {
    backgroundColor: "rgba(59, 142, 237, 0.2)",
    outline: "1px solid rgba(59, 142, 237, 0.4)",
    color: "#e2e4ea !important",
  },
  ".cm-tooltip": {
    backgroundColor: "#21222d",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "6px",
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)",
    color: "#e2e4ea",
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      backgroundColor: "rgba(59, 142, 237, 0.2)",
      color: "#e2e4ea",
    },
  },
  ".cm-tooltip.cm-tooltip-lint": {
    borderRadius: "6px",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    backgroundColor: "#21222d",
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5)",
  },
  ".cm-foldGutter .cm-gutterElement": {
    color: "#4a4d5a",
    fontSize: "12px",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "rgba(59, 142, 237, 0.1)",
    border: "1px solid rgba(59, 142, 237, 0.2)",
    color: "#3b8eed",
    borderRadius: "3px",
    padding: "0 4px",
    margin: "0 2px",
  },
  ".cm-searchMatch": {
    backgroundColor: "rgba(245, 158, 11, 0.25)",
    outline: "1px solid rgba(245, 158, 11, 0.4)",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "rgba(245, 158, 11, 0.4)",
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
          theme="none"
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
