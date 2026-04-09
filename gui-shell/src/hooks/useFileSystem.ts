import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STORAGE_KEYS } from "../constants";
import type { RecentFileEntry, RecentProjectEntry, WorkspaceFileInfo } from "../types";
import {
  createProject as apiCreateProject,
  renameProject as apiRenameProject,
  listWorkspaceFiles,
  openWorkspaceFile,
  saveWorkspaceFile,
} from "../api";

const HAS_FSAPI =
  typeof window !== "undefined" && "showOpenFilePicker" in window;

const MAX_RECENT = 10;
const DEFAULT_NAME = "untitled.py";

type FileState = {
  handle: FileSystemFileHandle | null;
  filePath: string | null;
  fileName: string;
  isDirty: boolean;
  lastSavedContent: string;
};

function loadRecentFiles(): RecentFileEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.recentFiles);
    return raw ? (JSON.parse(raw) as RecentFileEntry[]) : [];
  } catch {
    return [];
  }
}

function persistRecentFiles(entries: RecentFileEntry[]) {
  localStorage.setItem(STORAGE_KEYS.recentFiles, JSON.stringify(entries));
}

function addRecentEntry(
  entries: RecentFileEntry[],
  entry: RecentFileEntry
): RecentFileEntry[] {
  const filtered = entries.filter((e) => e.path !== entry.path);
  return [entry, ...filtered].slice(0, MAX_RECENT);
}

function loadRecentProjects(): RecentProjectEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.recentProjects);
    return raw ? (JSON.parse(raw) as RecentProjectEntry[]) : [];
  } catch {
    return [];
  }
}

function persistRecentProjects(entries: RecentProjectEntry[]) {
  localStorage.setItem(STORAGE_KEYS.recentProjects, JSON.stringify(entries));
}

function addRecentProject(
  entries: RecentProjectEntry[],
  entry: RecentProjectEntry
): RecentProjectEntry[] {
  const filtered = entries.filter((e) => e.rootPath !== entry.rootPath);
  return [entry, ...filtered].slice(0, MAX_RECENT);
}

export type UseFileSystemReturn = {
  fileName: string;
  filePath: string | null;
  isDirty: boolean;
  recentFiles: RecentFileEntry[];
  recentProjects: RecentProjectEntry[];
  hasFSAPI: boolean;
  workspaceRoot: string | null;
  workspaceFiles: WorkspaceFileInfo[];
  projectName: string | null;
  newFile: (currentContent: string) => Promise<boolean>;
  openFile: () => Promise<{ code: string; name: string } | null>;
  openFolder: () => Promise<boolean>;
  save: (content: string) => Promise<boolean>;
  saveAs: (content: string) => Promise<boolean>;
  openRecent: (entry: RecentFileEntry) => Promise<{ code: string; name: string } | null>;
  openWorkspaceItem: (file: WorkspaceFileInfo) => Promise<{ code: string; name: string } | null>;
  markContentChanged: (content: string) => void;
  markClean: (content: string) => void;
  refreshWorkspace: () => Promise<void>;
  createProject: (name: string) => Promise<{ code: string; name: string }>;
  openProject: () => Promise<{ code: string; name: string } | null>;
  openRecentProject: (entry: RecentProjectEntry) => Promise<{ code: string; name: string } | null>;
  renameProject: (newName: string) => Promise<boolean>;
  exitProject: (currentContent: string) => Promise<boolean>;
};

export function useFileSystem(filesActive = false): UseFileSystemReturn {
  const [fileState, setFileState] = useState<FileState>({
    handle: null,
    filePath: null,
    fileName: DEFAULT_NAME,
    isDirty: false,
    lastSavedContent: "",
  });

  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>(loadRecentFiles);
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>(loadRecentProjects);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEYS.workspacePath)
  );
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileInfo[]>([]);
  const [projectName, setProjectName] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEYS.projectName)
  );
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    if (workspaceRoot) {
      localStorage.setItem(STORAGE_KEYS.workspacePath, workspaceRoot);
    } else {
      localStorage.removeItem(STORAGE_KEYS.workspacePath);
    }
  }, [workspaceRoot]);

  useEffect(() => {
    if (projectName) {
      localStorage.setItem(STORAGE_KEYS.projectName, projectName);
    } else {
      localStorage.removeItem(STORAGE_KEYS.projectName);
    }
  }, [projectName]);

  const refreshWorkspace = useCallback(async () => {
    if (!workspaceRoot) return;
    try {
      const data = await listWorkspaceFiles(workspaceRoot);
      setWorkspaceFiles(data.files);
    } catch {
      setWorkspaceFiles([]);
    }
  }, [workspaceRoot]);

  useEffect(() => {
    if (workspaceRoot && filesActive) {
      void refreshWorkspace();
    }
  }, [workspaceRoot, filesActive, refreshWorkspace]);

  useEffect(() => {
    const prefix = projectName ? `${projectName} — ` : "";
    const title = fileState.isDirty
      ? `* ${fileState.fileName} — ${prefix}DCQ.io`
      : `${fileState.fileName} — ${prefix}DCQ.io`;
    document.title = title;
  }, [fileState.fileName, fileState.isDirty, projectName]);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (fileState.isDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [fileState.isDirty]);

  const confirmDiscard = useCallback(
    (currentContent: string): boolean => {
      if (!fileState.isDirty) return true;
      if (currentContent === fileState.lastSavedContent) return true;
      return window.confirm(
        "You have unsaved changes. Discard them?"
      );
    },
    [fileState.isDirty, fileState.lastSavedContent]
  );

  const pushRecent = useCallback(
    (name: string, path: string) => {
      const entry: RecentFileEntry = { name, path, openedAt: Date.now() };
      setRecentFiles((prev) => {
        const next = addRecentEntry(prev, entry);
        persistRecentFiles(next);
        return next;
      });
    },
    []
  );

  const pushRecentProject = useCallback(
    (name: string, rootPath: string) => {
      const entry: RecentProjectEntry = { name, rootPath, openedAt: Date.now() };
      setRecentProjects((prev) => {
        const next = addRecentProject(prev, entry);
        persistRecentProjects(next);
        return next;
      });
    },
    []
  );

  const newFile = useCallback(
    async (currentContent: string): Promise<boolean> => {
      if (!confirmDiscard(currentContent)) return false;
      setFileState({
        handle: null,
        filePath: null,
        fileName: DEFAULT_NAME,
        isDirty: false,
        lastSavedContent: "",
      });
      return true;
    },
    [confirmDiscard]
  );

  const openFile = useCallback(async (): Promise<{
    code: string;
    name: string;
  } | null> => {
    if (HAS_FSAPI) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: "Python files",
              accept: { "text/x-python": [".py"] },
            },
          ],
          multiple: false,
        });
        const file: File = await handle.getFile();
        const code = await file.text();
        const name = file.name;
        setFileState({
          handle,
          filePath: name,
          fileName: name,
          isDirty: false,
          lastSavedContent: code,
        });
        pushRecent(name, name);
        return { code, name };
      } catch {
        return null;
      }
    }

    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".py";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const code = await file.text();
        setFileState({
          handle: null,
          filePath: file.name,
          fileName: file.name,
          isDirty: false,
          lastSavedContent: code,
        });
        pushRecent(file.name, file.name);
        resolve({ code, name: file.name });
      };
      input.click();
    });
  }, [pushRecent]);

  const openFolder = useCallback(async (): Promise<boolean> => {
    if (HAS_FSAPI) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        dirHandleRef.current = dirHandle;

        const files: WorkspaceFileInfo[] = [];
        for await (const entry of dirHandle.values()) {
          if (entry.kind === "file" && entry.name.endsWith(".py")) {
            const file: File = await entry.getFile();
            files.push({
              name: entry.name,
              path: entry.name,
              size: file.size,
              modified: file.lastModified,
            });
          }
        }
        files.sort((a, b) => a.name.localeCompare(b.name));
        setWorkspaceFiles(files);
        setWorkspaceRoot(dirHandle.name);
        setProjectName(dirHandle.name);
        pushRecentProject(dirHandle.name, dirHandle.name);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, [pushRecentProject]);

  const save = useCallback(
    async (content: string): Promise<boolean> => {
      if (HAS_FSAPI && fileState.handle) {
        try {
          const writable = await (fileState.handle as any).createWritable();
          await writable.write(content);
          await writable.close();
          setFileState((prev) => ({
            ...prev,
            isDirty: false,
            lastSavedContent: content,
          }));
          return true;
        } catch {
          return false;
        }
      }

      if (fileState.filePath && !HAS_FSAPI) {
        try {
          await saveWorkspaceFile(fileState.filePath, content);
          setFileState((prev) => ({
            ...prev,
            isDirty: false,
            lastSavedContent: content,
          }));
          return true;
        } catch {
          return false;
        }
      }

      return saveAsImpl(content);
    },
    [fileState.handle, fileState.filePath]
  );

  const saveAsImpl = useCallback(
    async (content: string): Promise<boolean> => {
      if (HAS_FSAPI) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileState.fileName,
            types: [
              {
                description: "Python files",
                accept: { "text/x-python": [".py"] },
              },
            ],
          });
          const writable = await handle.createWritable();
          await writable.write(content);
          await writable.close();
          const name = handle.name;
          setFileState({
            handle,
            filePath: name,
            fileName: name,
            isDirty: false,
            lastSavedContent: content,
          });
          pushRecent(name, name);
          return true;
        } catch {
          return false;
        }
      }

      const blob = new Blob([content], { type: "text/x-python" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileState.fileName;
      a.click();
      URL.revokeObjectURL(url);
      setFileState((prev) => ({
        ...prev,
        isDirty: false,
        lastSavedContent: content,
      }));
      return true;
    },
    [fileState.fileName, pushRecent]
  );

  const saveAs = useCallback(
    (content: string) => saveAsImpl(content),
    [saveAsImpl]
  );

  const openRecent = useCallback(
    async (
      entry: RecentFileEntry
    ): Promise<{ code: string; name: string } | null> => {
      try {
        const data = await openWorkspaceFile(entry.path);
        setFileState({
          handle: null,
          filePath: data.path,
          fileName: data.name,
          isDirty: false,
          lastSavedContent: data.code,
        });
        pushRecent(data.name, data.path);
        return { code: data.code, name: data.name };
      } catch {
        return null;
      }
    },
    [pushRecent]
  );

  const openWorkspaceItem = useCallback(
    async (
      file: WorkspaceFileInfo
    ): Promise<{ code: string; name: string } | null> => {
      if (HAS_FSAPI && dirHandleRef.current) {
        try {
          const handle = await dirHandleRef.current.getFileHandle(file.name);
          const f: File = await handle.getFile();
          const code = await f.text();
          setFileState({
            handle,
            filePath: file.name,
            fileName: file.name,
            isDirty: false,
            lastSavedContent: code,
          });
          pushRecent(file.name, file.path);
          return { code, name: file.name };
        } catch {
          /* fall through to server-side */
        }
      }

      try {
        const data = await openWorkspaceFile(file.path);
        setFileState({
          handle: null,
          filePath: data.path,
          fileName: data.name,
          isDirty: false,
          lastSavedContent: data.code,
        });
        pushRecent(data.name, data.path);
        return { code: data.code, name: data.name };
      } catch {
        return null;
      }
    },
    [pushRecent]
  );

  const createProjectFn = useCallback(
    async (name: string): Promise<{ code: string; name: string }> => {
      const result = await apiCreateProject(name);
      setProjectName(result.name);
      setWorkspaceRoot(result.rootPath);
      pushRecentProject(result.name, result.rootPath);
      setFileState({
        handle: null,
        filePath: result.starterFile,
        fileName: "main.py",
        isDirty: false,
        lastSavedContent: result.starterCode,
      });
      return { code: result.starterCode, name: "main.py" };
    },
    [pushRecentProject]
  );

  const openProject = useCallback(async (): Promise<{
    code: string;
    name: string;
  } | null> => {
    if (!HAS_FSAPI) return null;
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      dirHandleRef.current = dirHandle;

      const files: WorkspaceFileInfo[] = [];
      let firstPyHandle: FileSystemFileHandle | null = null;
      for await (const entry of dirHandle.values()) {
        if (entry.kind === "file" && entry.name.endsWith(".py")) {
          const file: File = await entry.getFile();
          files.push({
            name: entry.name,
            path: entry.name,
            size: file.size,
            modified: file.lastModified,
          });
          if (!firstPyHandle) {
            firstPyHandle = entry;
          }
        }
      }
      files.sort((a, b) => a.name.localeCompare(b.name));
      setWorkspaceFiles(files);
      setWorkspaceRoot(dirHandle.name);
      setProjectName(dirHandle.name);
      pushRecentProject(dirHandle.name, dirHandle.name);

      if (firstPyHandle) {
        const f: File = await firstPyHandle.getFile();
        const code = await f.text();
        setFileState({
          handle: firstPyHandle,
          filePath: f.name,
          fileName: f.name,
          isDirty: false,
          lastSavedContent: code,
        });
        return { code, name: f.name };
      }
      return null;
    } catch {
      return null;
    }
  }, [pushRecentProject]);

  const openRecentProject = useCallback(
    async (
      entry: RecentProjectEntry
    ): Promise<{ code: string; name: string } | null> => {
      try {
        const data = await listWorkspaceFiles(entry.rootPath);
        setWorkspaceRoot(entry.rootPath);
        setProjectName(entry.name);
        setWorkspaceFiles(data.files);
        pushRecentProject(entry.name, entry.rootPath);

        const firstFile = data.files[0];
        if (firstFile) {
          const fileData = await openWorkspaceFile(firstFile.path);
          setFileState({
            handle: null,
            filePath: fileData.path,
            fileName: fileData.name,
            isDirty: false,
            lastSavedContent: fileData.code,
          });
          return { code: fileData.code, name: fileData.name };
        }
        return null;
      } catch {
        return null;
      }
    },
    [pushRecentProject]
  );

  const renameProjectFn = useCallback(
    async (newName: string): Promise<boolean> => {
      if (!workspaceRoot) return false;
      try {
        const result = await apiRenameProject(workspaceRoot, newName);
        setProjectName(result.name);
        setWorkspaceRoot(result.rootPath);
        pushRecentProject(result.name, result.rootPath);
        return true;
      } catch {
        return false;
      }
    },
    [workspaceRoot, pushRecentProject]
  );

  const exitProject = useCallback(
    async (currentContent: string): Promise<boolean> => {
      if (!confirmDiscard(currentContent)) return false;
      setProjectName(null);
      setWorkspaceRoot(null);
      setWorkspaceFiles([]);
      dirHandleRef.current = null;
      setFileState({
        handle: null,
        filePath: null,
        fileName: DEFAULT_NAME,
        isDirty: false,
        lastSavedContent: "",
      });
      return true;
    },
    [confirmDiscard]
  );

  const markContentChanged = useCallback(
    (content: string) => {
      setFileState((prev) => ({
        ...prev,
        isDirty: content !== prev.lastSavedContent,
      }));
    },
    []
  );

  const markClean = useCallback((content: string) => {
    setFileState((prev) => ({
      ...prev,
      isDirty: false,
      lastSavedContent: content,
    }));
  }, []);

  return useMemo(
    () => ({
      fileName: fileState.fileName,
      filePath: fileState.filePath,
      isDirty: fileState.isDirty,
      recentFiles,
      recentProjects,
      hasFSAPI: HAS_FSAPI,
      workspaceRoot,
      workspaceFiles,
      projectName,
      newFile,
      openFile,
      openFolder,
      save,
      saveAs,
      openRecent,
      openWorkspaceItem,
      markContentChanged,
      markClean,
      refreshWorkspace,
      createProject: createProjectFn,
      openProject,
      openRecentProject,
      renameProject: renameProjectFn,
      exitProject,
    }),
    [
      fileState.fileName,
      fileState.filePath,
      fileState.isDirty,
      recentFiles,
      recentProjects,
      workspaceRoot,
      workspaceFiles,
      projectName,
      newFile,
      openFile,
      openFolder,
      save,
      saveAs,
      openRecent,
      openWorkspaceItem,
      markContentChanged,
      markClean,
      refreshWorkspace,
      createProjectFn,
      openProject,
      openRecentProject,
      renameProjectFn,
      exitProject,
    ]
  );
}
