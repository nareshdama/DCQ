import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelRun, runScript } from "../api";
import { API_BASE_URL } from "../config";
import type {
  Diagnostic,
  ExportFormat,
  RunResponse,
  RunTrigger,
  SceneObject,
  UiStatus,
} from "../types";

const IDLE_STATUS: UiStatus = {
  label: "Idle",
  tone: "neutral",
};

export function useCadQueryRunner(script: string) {
  const [status, setStatus] = useState<UiStatus>(IDLE_STATUS);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [clientError, setClientError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    setDiagnostics([]);
  }, [script]);

  const cancel = useCallback(async () => {
    // Abort the HTTP request
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Cancel the server-side execution
    const runId = activeRunIdRef.current;
    if (runId) {
      activeRunIdRef.current = null;
      try {
        await cancelRun(runId);
      } catch {
        // Best-effort — the run may have already completed
      }
    }
    setStatus({ label: "Cancelled", tone: "neutral" });
  }, []);

  const execute = useCallback(
    async (
      exportFormats: ExportFormat[] = [],
      trigger: RunTrigger = "manual"
    ) => {
      // Cancel any in-flight execution before starting a new one
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;
      activeRunIdRef.current = null;

      const isExport = exportFormats.includes("step");
      setClientError("");
      setDiagnostics([]);
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
        const result = await runScript(script, exportFormats, controller.signal);
        // Track the server-side run_id for cancellation
        activeRunIdRef.current = result.run_id ?? null;

        setRunResult(result);
        setDiagnostics(result.diagnostics ?? []);
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
        if ((error as Error).name === "AbortError") {
          // Request was intentionally cancelled — don't update state
          return;
        }
        const message = (error as Error).message;
        setDiagnostics([]);
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

  // Resolve scene object STL URLs to full URLs for the frontend
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
