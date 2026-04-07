import { API_BASE_URL } from "./config";
import type {
  ExamplesIndexResponse,
  ExportFormat,
  RunResponse,
} from "./types";

export async function runScript(
  script: string,
  exportFormats: ExportFormat[] = []
): Promise<RunResponse> {
  const response = await fetch(`${API_BASE_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script, exportFormats })
  });
  if (!response.ok) {
    throw new Error(`Run failed: ${response.status}`);
  }
  return response.json();
}

export async function convertStepExportToStl(
  stepExportPath: string
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/convert-step-export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stepExportPath })
  });
  if (!response.ok) {
    throw new Error("Failed to convert STEP export");
  }
  const data = (await response.json()) as { stl: string };
  return `${API_BASE_URL}${data.stl}`;
}

export async function convertStepUploadToStl(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE_URL}/convert-step-upload`, {
    method: "POST",
    body: form
  });
  if (!response.ok) {
    throw new Error("Failed to convert STEP file");
  }
  const data = (await response.json()) as { stl: string };
  return `${API_BASE_URL}${data.stl}`;
}

export async function getExamplesIndex(): Promise<ExamplesIndexResponse> {
  const response = await fetch(`${API_BASE_URL}/examples`);
  if (!response.ok) {
    throw new Error("Failed to load examples");
  }
  return response.json();
}

export async function getExampleCode(fileName: string): Promise<string> {
  const response = await fetch(
    `${API_BASE_URL}/examples/${encodeURIComponent(fileName)}`
  );
  if (!response.ok) {
    throw new Error("Failed to load selected example");
  }
  const data = (await response.json()) as { file: string; code: string };
  return data.code;
}
