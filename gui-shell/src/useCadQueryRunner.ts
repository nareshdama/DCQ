import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelRun, checkSyntax, runScript } from "./api";
import { API_BASE_URL } from "./config";
import type {
  Diagnostic,
  ExportFormat,
  RunResponse,
  RunTrigger,
  SceneObject,
  UiStatus,
} from "./types";

const IDLE_STATUS: UiStatus = {
  label: "Idle",
  tone: "neutral",
};

const SYNTAX_CHECK_DEBOUNCE_MS = 150;

function createRunId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 14);
}

function mergeDiagnostics(...collections: Diagnostic[][]) {
  const seen = new Set<string>();
  const merged: Diagnostic[] = [];

  for (const collection of collections) {
    for (const diagnostic of collection) {
      const key = [
        diagnostic.line,
        diagnostic.severity ?? "error",
        diagnostic.message,
        diagnostic.detail ?? "",
      ].join("|");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(diagnostic);
    }
  }

  return merged;
}

export function useCadQueryRunner(script: string) {
  const [status, setStatus] = useState<UiStatus>(IDLE_STATUS);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<Diagnostic[]>([]);
  const [syntaxDiagnostics, setSyntaxDiagnostics] = useState<Diagnostic[]>([]);
  const [clientError, setClientError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const syntaxAbortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    setRuntimeDiagnostics([]);
    setSyntaxDiagnostics([]);

    if (syntaxAbortRef.current) {
      syntaxAbortRef.current.abort();
      syntaxAbortRef.current = null;
    }

    if (!script.trim()) {
      return;
    }

    const controller = new AbortController();
    syntaxAbortRef.current = controller;
    const timer = window.setTimeout(() => {
      void checkSyntax(script, controller.signal)
        .then((result) => {
          if (controller.signal.aborted || syntaxAbortRef.current !== controller) {
            return;
          }
          setSyntaxDiagnostics(result.diagnostics ?? []);
        })
        .catch((error) => {
          if ((error as Error).name === "AbortError") {
            return;
          }
          if (syntaxAbortRef.current === controller) {
            setSyntaxDiagnostics([]);
          }
        });
    }, SYNTAX_CHECK_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (syntaxAbortRef.current === controller) {
        syntaxAbortRef.current = null;
      }
    };
  }, [script]);

  const diagnostics = useMemo(
    () => mergeDiagnostics(syntaxDiagnostics, runtimeDiagnostics),
    [runtimeDiagnostics, syntaxDiagnostics]
  );

  const cancel = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    const runId = activeRunIdRef.current;
    if (runId) {
      activeRunIdRef.current = null;
      try {
        await cancelRun(runId);
      } catch {
        // Best-effort; the run may have already completed.
      }
    }

    setStatus({ label: "Cancelled", tone: "neutral" });
  }, []);

  const execute = useCallback(
    async (
      exportFormats: ExportFormat[] = [],
      trigger: RunTrigger = "manual"
    ) => {
      const previousRunId = activeRunIdRef.current;
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (previousRunId) {
        activeRunIdRef.current = null;
        try {
          await cancelRun(previousRunId);
        } catch {
          // Best-effort; the previous run may have already completed.
        }
      }

      const controller = new AbortController();
      const runId = createRunId();
      abortRef.current = controller;
      activeRunIdRef.current = runId;

      const isExport = exportFormats.includes("step");
      setClientError("");
      setRuntimeDiagnostics([]);
      setStatus({
        label:
          trigger === "parameter"
            ? "Preview updating..."
            : trigger === "live"
              ? "Live preview updating..."
              : isExport
                ? "Exporting..."
                : "Running...",
        tone: "progress",
      });

      try {
        const result = await runScript(script, exportFormats, controller.signal, runId);
        if (activeRunIdRef.current === runId) {
          activeRunIdRef.current = null;
        }

        setRunResult(result);
        setRuntimeDiagnostics(result.diagnostics ?? []);
        setClientError("");

        const timeLabel = result.execution_time_ms != null
          ? ` (${result.execution_time_ms}ms)`
          : "";

        setStatus(
          result.ok
            ? {
                label:
                  trigger === "parameter"
                    ? `Preview ready${timeLabel}`
                    : trigger === "live"
                      ? `Live preview ready${timeLabel}`
                      : isExport
                        ? `Export ready${timeLabel}`
                        : `Ready${timeLabel}`,
                tone: "success",
              }
            : {
                label: isExport ? "Export failed" : "Run failed",
                tone: "danger",
              }
        );
      } catch (error) {
        if (activeRunIdRef.current === runId) {
          activeRunIdRef.current = null;
        }
        if ((error as Error).name === "AbortError") {
          return;
        }
        const message = (error as Error).message;
        setRuntimeDiagnostics([]);
        setClientError(message);
        setStatus({ label: message, tone: "danger" });
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [script]
  );

  const stdout = runResult?.stdout ?? "";
  const stderr = clientError || runResult?.stderr || "";
  const stlUrl = runResult?.exports?.stl
    ? `${API_BASE_URL}${runResult.exports.stl}`
    : undefined;
  const stepUrl = runResult?.exports?.step
    ? `${API_BASE_URL}${runResult.exports.step}`
    : undefined;

  const scene: SceneObject[] = useMemo(() => {
    const raw = runResult?.scene ?? [];
    return raw.map((obj) => ({
      ...obj,
      stl: obj.stl ? `${API_BASE_URL}${obj.stl}` : undefined,
      step: obj.step ? `${API_BASE_URL}${obj.step}` : undefined,
    }));
  }, [runResult]);

  return {
    cancel,
    diagnostics,
    execute,
    runResult,
    scene,
    status,
    stderr,
    stdout,
    stepUrl,
    stlUrl,
    setStatus,
  };
}
