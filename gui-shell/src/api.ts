import { API_BASE_URL } from "./config";
import type {
  ExamplesIndexResponse,
  ExportFormat,
  RunResponse,
  SyntaxCheckResponse,
  WorkspaceFileInfo,
} from "./types";

export async function runScript(
  script: string,
  exportFormats: ExportFormat[] = [],
  signal?: AbortSignal,
  runId?: string
): Promise<RunResponse> {
  const response = await fetch(`${API_BASE_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script, exportFormats, runId }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Run failed: ${response.status}`);
  }
  return response.json();
}

export async function checkSyntax(
  script: string,
  signal?: AbortSignal
): Promise<SyntaxCheckResponse> {
  const response = await fetch(`${API_BASE_URL}/syntax-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Syntax check failed: ${response.status}`);
  }
  return response.json();
}

export async function cancelRun(
  runId: string
): Promise<{ cancelled: boolean; runId: string }> {
  const response = await fetch(`${API_BASE_URL}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId }),
  });
  if (!response.ok) {
    throw new Error(`Cancel failed: ${response.status}`);
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

/* ── Workspace File Operations ── */

export async function openWorkspaceFile(
  path: string
): Promise<{ code: string; path: string; name: string }> {
  const response = await fetch(`${API_BASE_URL}/workspace/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Failed to open file" }));
    throw new Error(err.detail ?? "Failed to open file");
  }
  return response.json();
}

export async function saveWorkspaceFile(
  path: string,
  code: string
): Promise<{ path: string; name: string }> {
  const response = await fetch(`${API_BASE_URL}/workspace/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, code }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Failed to save file" }));
    throw new Error(err.detail ?? "Failed to save file");
  }
  return response.json();
}

export async function listWorkspaceFiles(
  root: string
): Promise<{ root: string; files: WorkspaceFileInfo[] }> {
  const response = await fetch(`${API_BASE_URL}/workspace/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ root }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Failed to list files" }));
    throw new Error(err.detail ?? "Failed to list files");
  }
  return response.json();
}

export async function saveAsWorkspaceFile(
  directory: string,
  name: string,
  code: string
): Promise<{ path: string; name: string }> {
  const response = await fetch(`${API_BASE_URL}/workspace/save-as`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory, name, code }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Failed to save file" }));
    throw new Error(err.detail ?? "Failed to save file");
  }
  return response.json();
}

/* ── Project Operations ── */

export async function createProject(
  name: string,
  parentDir?: string
): Promise<{ rootPath: string; name: string; starterFile: string; starterCode: string }> {
  const response = await fetch(`${API_BASE_URL}/workspace/create-project`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentDir }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Failed to create project" }));
    throw new Error(err.detail ?? "Failed to create project");
  }
  return response.json();
}

export async function renameProject(
  currentPath: string,
  newName: string
): Promise<{ rootPath: string; name: string }> {
  const response = await fetch(`${API_BASE_URL}/workspace/rename-project`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPath, newName }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Failed to rename project" }));
    throw new Error(err.detail ?? "Failed to rename project");
  }
  return response.json();
}
