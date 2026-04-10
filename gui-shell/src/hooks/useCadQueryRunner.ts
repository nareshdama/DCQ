import { useCallback, useMemo, useRef, useState } from "react";
import { runScript } from "../api";
import { API_BASE_URL } from "../config";
import type { ExportFormat, RunResponse, RunTrigger, UiStatus } from "../types";

const IDLE_STATUS: UiStatus = {
  label: "Idle",
  tone: "neutral",
};

export function useCadQueryRunner(script: string) {
  const [status, setStatus] = useState<UiStatus>(IDLE_STATUS);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [clientError, setClientError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(
    async (
      exportFormats: ExportFormat[] = [],
      trigger: RunTrigger = "manual"
    ) => {
      // Cancel any in-flight request before starting a new one
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const isExport = exportFormats.includes("step");
      setClientError("");
      setStatus({
        label:
          trigger === "live"
            ? "Live preview updating..."
            : isExport
              ? "Exporting..."
              : "Running...",
        tone: "progress",
      });

      try {
        const result = await runScript(script, exportFormats, controller.signal);
        if (controller.signal.aborted) return;
        setRunResult(result);
        setClientError("");
        setStatus(
          result.ok
            ? {
                label:
                  trigger === "live"
                    ? "Live preview ready"
                    : isExport
                      ? "Export ready"
                      : "Ready",
                tone: "success",
              }
            : {
                label: isExport ? "Export failed" : "Run failed",
                tone: "danger",
              }
        );
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        const message = (error as Error).message;
        setClientError(message);
        setStatus({ label: message, tone: "danger" });
      }
    },
    [script]
  );

  const diagnostics = useMemo(() => runResult?.diagnostics ?? [], [runResult]);
  const stdout = runResult?.stdout ?? "";
  const stderr = clientError || runResult?.stderr || "";
  const stlUrl = runResult?.exports?.stl
    ? `${API_BASE_URL}${runResult.exports.stl}`
    : undefined;
  const stepUrl = runResult?.exports?.step
    ? `${API_BASE_URL}${runResult.exports.step}`
    : undefined;

  return {
    diagnostics,
    execute,
    runResult,
    status,
    stderr,
    stdout,
    stepUrl,
    stlUrl,
    setStatus,
  };
}
