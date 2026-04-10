from __future__ import annotations

import asyncio
import json
import logging
import re
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
PROJECT_ROOT = ROOT.parent
EXPORT_DIR = ROOT / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

from executor import ScriptExecutor, cleanup_exports, parse_diagnostics

logger = logging.getLogger(__name__)

from ai_routes import router as ai_router

# ── Application lifecycle ────────────────────────────────────────────────────

executor = ScriptExecutor(export_dir=EXPORT_DIR)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the executor pool on startup; shut it down cleanly on exit."""
    yield
    executor.shutdown()


app = FastAPI(title="CadQuery GUI Bridge", lifespan=lifespan)
app.include_router(ai_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/exports", StaticFiles(directory=str(EXPORT_DIR)), name="exports")


# ── Request/Response models ──────────────────────────────────────────────────


class RunRequest(BaseModel):
    script: str
    exportFormats: list[str] = []
    runId: str | None = None


class SyntaxCheckRequest(BaseModel):
    script: str


class CancelRequest(BaseModel):
    runId: str


class ConvertStepRequest(BaseModel):
    stepExportPath: str


class WorkspaceOpenRequest(BaseModel):
    path: str


class WorkspaceSaveRequest(BaseModel):
    path: str
    code: str


class WorkspaceListRequest(BaseModel):
    root: str


class WorkspaceSaveAsRequest(BaseModel):
    directory: str
    name: str
    code: str


class CreateProjectRequest(BaseModel):
    name: str
    parentDir: str | None = None


class RenameProjectRequest(BaseModel):
    currentPath: str
    newName: str


EXAMPLES_DIR = PROJECT_ROOT / "example-library" / "cadquery-docs"
STARTER_CODE = (
    'import cadquery as cq\n\n'
    'length = 80.0\n'
    'width = 50.0\n'
    'height = 20.0\n'
    'fillet_radius = 3.0\n'
    'hole_diameter = 6.0\n\n'
    'result = (\n'
    '    cq.Workplane("XY")\n'
    '    .box(length, width, height)\n'
    '    .edges("|Z")\n'
    '    .fillet(fillet_radius)\n'
    '    .faces(">Z")\n'
    '    .workplane()\n'
    '    .hole(hole_diameter)\n'
    ')\n'
)


# ── Utility functions ────────────────────────────────────────────────────────


def _sanitize_example_title(title: str, fallback: str) -> str:
    """
    Clean Unicode artifacts and excess whitespace from an example title.

    Args:
        title: Raw title string, possibly containing non-printable characters.
        fallback: Value to return if the cleaned title is empty.

    Returns:
        Cleaned title string, or fallback if cleaning produced an empty string.
    """
    cleaned = title.replace("\uf0c1", " ")
    cleaned = "".join(character for character in cleaned if character.isprintable())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or fallback


def _sanitize_examples_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Normalize an examples index payload for safe frontend consumption.

    Args:
        payload: Raw examples index dict with ``examples`` list and ``count``.

    Returns:
        Copy of payload with sanitized titles and corrected count.
    """
    sanitized = dict(payload)
    examples = []

    for entry in payload.get("examples", []):
        if not isinstance(entry, dict):
            continue

        example = dict(entry)
        fallback = str(example.get("file", example.get("title", "Example")))
        fallback = Path(fallback).stem
        example["title"] = _sanitize_example_title(
            str(example.get("title", fallback)),
            fallback,
        )
        examples.append(example)

    sanitized["examples"] = examples
    sanitized["count"] = len(examples)
    return sanitized


def _collect_protected_export_files() -> set[str]:
    """
    Build a set of export filenames that are currently in-flight.

    Protects both combined exports ({run_id}.stl) and per-object exports
    ({run_id}_{index}.stl) for up to 50 objects per run.

    Returns:
        Set of filenames for active runs.
    """
    protected: set[str] = set()
    for run_id in executor.active_run_ids:
        protected.add(f"{run_id}.stl")
        protected.add(f"{run_id}.step")
        # Protect per-object exports (up to 50 objects)
        for i in range(50):
            protected.add(f"{run_id}_{i}.stl")
            protected.add(f"{run_id}_{i}.step")
    return protected


def _build_syntax_diagnostics(script: str) -> list[dict[str, Any]]:
    """
    Compile a script and return syntax-only diagnostics without executing it.

    Args:
        script: Python source code from the editor.

    Returns:
        Empty list when the script compiles, otherwise a single structured
        diagnostic describing the syntax problem.
    """
    try:
        compile(script, "<script>", "exec")
    except SyntaxError as exc:
        message = exc.msg or "Invalid Python syntax"
        if type(exc) is not SyntaxError:
            message = f"{type(exc).__name__}: {message}"
        detail = exc.text.strip() if exc.text else None
        return [
            {
                "line": max(exc.lineno or 1, 1),
                "message": message,
                "severity": "error",
                "detail": detail,
            }
        ]
    except Exception as exc:
        return [
            {
                "line": 1,
                "message": f"{type(exc).__name__}: {exc}",
                "severity": "error",
                "detail": None,
            }
        ]

    return []


# ── Script execution endpoints ───────────────────────────────────────────────


def _run_script_sync(payload: RunRequest) -> dict[str, Any]:
    """
    Synchronous script execution via the process pool.

    Used by the /run endpoint (through async wrapper) and directly by tests.

    Args:
        payload: RunRequest with ``script`` and optional ``exportFormats``.

    Returns:
        Execution result dict.
    """
    result = executor.run(
        payload.script,
        payload.exportFormats,
        run_id=payload.runId,
    )

    # Cleanup stale exports
    try:
        protected = _collect_protected_export_files()
        run_id = result.get("run_id")
        if run_id:
            protected.add(f"{run_id}.stl")
            protected.add(f"{run_id}.step")
            # Protect per-object exports from this run
            for i, entry in enumerate(result.get("scene", [])):
                protected.add(f"{run_id}_{i}.stl")
                protected.add(f"{run_id}_{i}.step")
        cleanup_exports(EXPORT_DIR, protected_files=protected)
    except Exception as exc:
        logger.debug("Export cleanup error (non-fatal): %s", exc)

    return result


@app.post("/run")
async def run_script(payload: RunRequest) -> dict[str, Any]:
    """
    Execute a CadQuery script in an isolated worker process.

    The script runs in a subprocess via the ScriptExecutor, keeping the
    FastAPI event loop responsive. After execution, stale export files
    are cleaned up in the background.

    Args:
        payload: RunRequest with ``script`` and optional ``exportFormats``.

    Returns:
        Execution result dict with ok, stdout, stderr, exports, diagnostics,
        run_id, and execution_time_ms.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: _run_script_sync(payload))


@app.post("/syntax-check")
def syntax_check(payload: SyntaxCheckRequest) -> dict[str, Any]:
    """
    Compile a script and return immediate syntax diagnostics for the editor.

    Args:
        payload: SyntaxCheckRequest containing the current editor script.

    Returns:
        Dict with ``ok`` and ``diagnostics`` keys.
    """
    diagnostics = _build_syntax_diagnostics(payload.script)
    return {"ok": not diagnostics, "diagnostics": diagnostics}


@app.post("/cancel")
def cancel_run(payload: CancelRequest) -> dict[str, Any]:
    """
    Cancel a running script execution.

    Args:
        payload: CancelRequest with the ``runId`` to cancel.

    Returns:
        Dict with ``cancelled`` (bool) and ``runId``.
    """
    cancelled = executor.cancel(payload.runId)
    return {"cancelled": cancelled, "runId": payload.runId}


@app.get("/health")
def health() -> dict[str, Any]:
    """
    Health check endpoint. Returns 200 immediately regardless of executor state.

    Returns:
        Dict with status and list of active run IDs.
    """
    return {
        "status": "ok",
        "activeRuns": executor.active_run_ids,
    }


@app.get("/exports/cleanup")
def manual_cleanup() -> dict[str, int]:
    """
    Admin endpoint to manually trigger export file cleanup.

    Returns:
        Dict with the number of files deleted.
    """
    protected = _collect_protected_export_files()
    deleted = cleanup_exports(EXPORT_DIR, protected_files=protected)
    return {"deleted": deleted}


# ── Example library endpoints ────────────────────────────────────────────────


@app.get("/examples")
def list_examples() -> dict[str, Any]:
    """
    List all available CadQuery examples from the example library.

    Returns:
        Sanitized examples index with name, count, and examples list.
    """
    index_path = EXAMPLES_DIR / "index.json"
    if index_path.exists():
        try:
            payload = json.loads(index_path.read_text(encoding="utf-8"))
            return _sanitize_examples_payload(payload)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to read index: {exc}")

    files = sorted(EXAMPLES_DIR.glob("*.py"))
    return _sanitize_examples_payload(
        {
            "name": "CadQuery Example Library",
            "count": len(files),
            "examples": [
                {"id": index + 1, "title": file_path.stem, "file": file_path.name}
                for index, file_path in enumerate(files)
            ],
        }
    )


@app.get("/examples/{file_name}")
def get_example(file_name: str) -> dict[str, str]:
    """
    Retrieve the source code of a specific example by filename.

    Args:
        file_name: Name of the example file (e.g., "box.py").

    Returns:
        Dict with ``file`` and ``code`` keys.

    Raises:
        HTTPException: 404 if the file does not exist or is outside the examples dir.
    """
    example_path = (EXAMPLES_DIR / file_name).resolve()
    if not example_path.exists() or EXAMPLES_DIR.resolve() not in example_path.parents:
        raise HTTPException(status_code=404, detail="Example not found")
    return {"file": file_name, "code": example_path.read_text(encoding="utf-8")}


# ── STEP conversion endpoints ───────────────────────────────────────────────


@app.post("/convert-step-export")
def convert_step_export(payload: ConvertStepRequest) -> dict[str, str]:
    """
    Convert a previously exported STEP file to STL for 3D preview.

    Args:
        payload: ConvertStepRequest with ``stepExportPath``.

    Returns:
        Dict with ``stl`` key pointing to the converted file URL.

    Raises:
        HTTPException: 400 if path is invalid, 500 if conversion fails.
    """
    from cadquery import exporters, importers

    relative_path = payload.stepExportPath.removeprefix("/exports/")
    step_path = (EXPORT_DIR / relative_path).resolve()
    if not step_path.exists() or EXPORT_DIR.resolve() not in step_path.parents:
        raise HTTPException(status_code=400, detail="Invalid STEP export path")

    try:
        imported = importers.importStep(str(step_path))
        output_name = f"{uuid.uuid4().hex[:12]}_from_step.stl"
        output_path = EXPORT_DIR / output_name
        exporters.export(
            imported,
            str(output_path),
            exportType="STL",
            tolerance=0.05,
            angularTolerance=0.1,
        )
        return {"stl": f"/exports/{output_name}"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"STEP conversion failed: {exc}")


@app.post("/convert-step-upload")
async def convert_step_upload(file: UploadFile = File(...)) -> dict[str, str]:
    """
    Upload a STEP/STP file and convert it to STL for 3D preview.

    Args:
        file: Uploaded STEP or STP file.

    Returns:
        Dict with ``stl`` key pointing to the converted file URL.

    Raises:
        HTTPException: 400 if not a STEP file, 500 if conversion fails.
    """
    from cadquery import exporters, importers

    suffix = Path(file.filename or "upload.step").suffix.lower()
    if suffix not in {".step", ".stp"}:
        raise HTTPException(status_code=400, detail="Only STEP/STP supported")

    step_path = EXPORT_DIR / f"{uuid.uuid4().hex[:12]}{suffix}"
    output_name = f"{uuid.uuid4().hex[:12]}_upload.stl"
    output_path = EXPORT_DIR / output_name

    try:
        step_path.write_bytes(await file.read())
        imported = importers.importStep(str(step_path))
        exporters.export(
            imported,
            str(output_path),
            exportType="STL",
            tolerance=0.05,
            angularTolerance=0.1,
        )
        return {"stl": f"/exports/{output_name}"}
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"STEP upload conversion failed: {exc}"
        )


# ── Workspace endpoints ──────────────────────────────────────────────────────

WORKSPACE_ALLOWED_ROOTS: list[Path] = [PROJECT_ROOT, Path.home()]


def _validate_workspace_path(target: Path) -> Path:
    """
    Validate that a filesystem path falls within allowed workspace roots.

    Args:
        target: Path to validate.

    Returns:
        Resolved absolute path.

    Raises:
        HTTPException: 403 if the path is outside all allowed roots.
    """
    resolved = target.resolve()
    for allowed_root in WORKSPACE_ALLOWED_ROOTS:
        try:
            resolved.relative_to(allowed_root.resolve())
            return resolved
        except ValueError:
            continue
    raise HTTPException(
        status_code=403,
        detail="Access denied: path is outside allowed workspace roots",
    )


@app.post("/workspace/open")
def workspace_open(payload: WorkspaceOpenRequest) -> dict[str, str]:
    """Open and read a workspace file."""
    target = _validate_workspace_path(Path(payload.path))
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if not target.is_file():
        raise HTTPException(status_code=400, detail="Path is not a file")
    try:
        code = target.read_text(encoding="utf-8")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {exc}")
    return {"code": code, "path": str(target), "name": target.name}


@app.post("/workspace/save")
def workspace_save(payload: WorkspaceSaveRequest) -> dict[str, str]:
    """Save content to an existing workspace file."""
    target = _validate_workspace_path(Path(payload.path))
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload.code, encoding="utf-8")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}")
    return {"path": str(target), "name": target.name}


@app.post("/workspace/list")
def workspace_list(payload: WorkspaceListRequest) -> dict[str, Any]:
    """List Python files in a workspace directory."""
    root = _validate_workspace_path(Path(payload.root))
    if not root.exists() or not root.is_dir():
        raise HTTPException(status_code=404, detail="Directory not found")
    files = []
    for entry in sorted(root.iterdir()):
        if entry.is_file() and entry.suffix.lower() == ".py":
            stat = entry.stat()
            files.append(
                {
                    "name": entry.name,
                    "path": str(entry),
                    "size": stat.st_size,
                    "modified": stat.st_mtime,
                }
            )
    return {"root": str(root), "files": files}


@app.post("/workspace/save-as")
def workspace_save_as(payload: WorkspaceSaveAsRequest) -> dict[str, str]:
    """Save content to a new file in the workspace."""
    directory = _validate_workspace_path(Path(payload.directory))
    if not directory.exists():
        raise HTTPException(status_code=404, detail="Directory not found")
    name = payload.name if payload.name.endswith(".py") else f"{payload.name}.py"
    target = directory / name
    _validate_workspace_path(target)
    try:
        target.write_text(payload.code, encoding="utf-8")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}")
    return {"path": str(target), "name": target.name}


DCQ_PROJECTS_DIR = Path.home() / "DCQ-Projects"


@app.post("/workspace/create-project")
def workspace_create_project(payload: CreateProjectRequest) -> dict[str, str]:
    """Create a new DCQ project directory with a starter file."""
    parent = Path(payload.parentDir) if payload.parentDir else DCQ_PROJECTS_DIR
    parent = _validate_workspace_path(parent)
    parent.mkdir(parents=True, exist_ok=True)

    safe_name = re.sub(r'[<>:"/\\|?*]', "_", payload.name).strip()
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid project name")

    project_dir = parent / safe_name
    if project_dir.exists():
        raise HTTPException(
            status_code=409, detail="A project with this name already exists"
        )

    try:
        project_dir.mkdir(parents=True)
        starter_file = project_dir / "main.py"
        starter_code = STARTER_CODE
        starter_file.write_text(starter_code, encoding="utf-8")
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to create project: {exc}"
        )

    return {
        "rootPath": str(project_dir),
        "name": safe_name,
        "starterFile": str(starter_file),
        "starterCode": starter_code,
    }


@app.post("/workspace/rename-project")
def workspace_rename_project(payload: RenameProjectRequest) -> dict[str, str]:
    """Rename an existing project directory."""
    current = _validate_workspace_path(Path(payload.currentPath))
    if not current.exists() or not current.is_dir():
        raise HTTPException(status_code=404, detail="Project directory not found")

    safe_name = re.sub(r'[<>:"/\\|?*]', "_", payload.newName).strip()
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid project name")

    new_path = current.parent / safe_name
    if new_path.exists():
        raise HTTPException(
            status_code=409, detail="A folder with this name already exists"
        )

    try:
        current.rename(new_path)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to rename project: {exc}"
        )

    return {"rootPath": str(new_path), "name": safe_name}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8008, reload=False)
