from __future__ import annotations

import io
import json
import re
import traceback
import uuid
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any

import cadquery as cq
from cadquery import exporters, importers
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
EXPORT_DIR = ROOT / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_UNIT = "mm"
STL_LINEAR_DEFLECTION_MM = 0.05
STL_ANGULAR_DEFLECTION_RAD = 0.1

from ai_routes import router as ai_router

app = FastAPI(title="CadQuery GUI Bridge")
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


class RunRequest(BaseModel):
    script: str
    exportFormats: list[str] = []


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


def _parse_diagnostics(error_text: str) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    for line in error_text.splitlines():
        if ", line " in line and 'File "<script>"' in line:
            try:
                line_number = int(line.split(", line ")[1].split(",")[0])
            except Exception:
                continue
            diagnostics.append({"line": line_number, "message": "Execution error"})
    return diagnostics


def _build_script_globals() -> dict[str, Any]:
    script_globals: dict[str, Any] = {
        "cq": cq,
        "cadquery": cq,
        "__name__": "__main__",
        "_last_shown": None,
    }

    def show_object(obj: Any, *args: Any, **kwargs: Any) -> Any:
        script_globals["_last_shown"] = obj
        return obj

    script_globals["show_object"] = show_object
    return script_globals


def _execute_script(
    script: str, export_formats: list[str] | None = None
) -> dict[str, Any]:
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    exports_payload: dict[str, str] = {}
    export_formats = export_formats or []

    try:
        script_globals = _build_script_globals()
        compiled = compile(script, "<script>", "exec")
        with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
            exec(compiled, script_globals)

        result = script_globals.get("result", script_globals.get("_last_shown"))
        if result is None:
            raise ValueError(
                "Script must set a `result` variable or call `show_object(...)`."
            )

        run_id = uuid.uuid4().hex[:12]
        if "stl" in export_formats:
            stl_name = f"{run_id}.stl"
            stl_path = EXPORT_DIR / stl_name
            exporters.export(
                result,
                str(stl_path),
                exportType="STL",
                tolerance=STL_LINEAR_DEFLECTION_MM,
                angularTolerance=STL_ANGULAR_DEFLECTION_RAD,
            )
            exports_payload["stl"] = f"/exports/{stl_name}"
        if "step" in export_formats:
            step_name = f"{run_id}.step"
            step_path = EXPORT_DIR / step_name
            exporters.export(result, str(step_path), exportType="STEP")
            exports_payload["step"] = f"/exports/{step_name}"

        return {
            "ok": True,
            "stdout": stdout_buffer.getvalue(),
            "stderr": stderr_buffer.getvalue(),
            "exports": exports_payload,
            "preset": {
                "profile": "industry-cad-defaults",
                "unit": DEFAULT_UNIT,
                "stlLinearDeflectionMm": STL_LINEAR_DEFLECTION_MM,
                "stlAngularDeflectionRad": STL_ANGULAR_DEFLECTION_RAD,
            },
            "diagnostics": [],
        }
    except Exception:
        traceback_text = traceback.format_exc()
        return {
            "ok": False,
            "stdout": stdout_buffer.getvalue(),
            "stderr": traceback_text,
            "exports": exports_payload,
            "diagnostics": _parse_diagnostics(traceback_text),
        }


def _sanitize_example_title(title: str, fallback: str) -> str:
    cleaned = title.replace("\uf0c1", " ")
    cleaned = "".join(character for character in cleaned if character.isprintable())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or fallback


def _sanitize_examples_payload(payload: dict[str, Any]) -> dict[str, Any]:
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


@app.post("/run")
def run_script(payload: RunRequest) -> dict[str, Any]:
    return _execute_script(payload.script, payload.exportFormats)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/examples")
def list_examples() -> dict[str, Any]:
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
    example_path = (EXAMPLES_DIR / file_name).resolve()
    if not example_path.exists() or EXAMPLES_DIR.resolve() not in example_path.parents:
        raise HTTPException(status_code=404, detail="Example not found")
    return {"file": file_name, "code": example_path.read_text(encoding="utf-8")}


@app.post("/convert-step-export")
def convert_step_export(payload: ConvertStepRequest) -> dict[str, str]:
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
            tolerance=STL_LINEAR_DEFLECTION_MM,
            angularTolerance=STL_ANGULAR_DEFLECTION_RAD,
        )
        return {"stl": f"/exports/{output_name}"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"STEP conversion failed: {exc}")


@app.post("/convert-step-upload")
async def convert_step_upload(file: UploadFile = File(...)) -> dict[str, str]:
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
            tolerance=STL_LINEAR_DEFLECTION_MM,
            angularTolerance=STL_ANGULAR_DEFLECTION_RAD,
        )
        return {"stl": f"/exports/{output_name}"}
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"STEP upload conversion failed: {exc}"
        )


WORKSPACE_ALLOWED_ROOTS: list[Path] = [PROJECT_ROOT, Path.home()]


def _validate_workspace_path(target: Path) -> Path:
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
    target = _validate_workspace_path(Path(payload.path))
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload.code, encoding="utf-8")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}")
    return {"path": str(target), "name": target.name}


@app.post("/workspace/list")
def workspace_list(payload: WorkspaceListRequest) -> dict[str, Any]:
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
    parent = Path(payload.parentDir) if payload.parentDir else DCQ_PROJECTS_DIR
    parent = _validate_workspace_path(parent)
    parent.mkdir(parents=True, exist_ok=True)

    safe_name = re.sub(r'[<>:"/\\|?*]', "_", payload.name).strip()
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid project name")

    project_dir = parent / safe_name
    if project_dir.exists():
        raise HTTPException(status_code=409, detail="A project with this name already exists")

    try:
        project_dir.mkdir(parents=True)
        starter_file = project_dir / "main.py"
        starter_code = (
            'import cadquery as cq\n\n'
            'result = (\n'
            '    cq.Workplane("XY")\n'
            '    .box(80, 50, 20)\n'
            '    .edges("|Z")\n'
            '    .fillet(3)\n'
            ')\n'
        )
        starter_file.write_text(starter_code, encoding="utf-8")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create project: {exc}")

    return {
        "rootPath": str(project_dir),
        "name": safe_name,
        "starterFile": str(starter_file),
        "starterCode": starter_code,
    }


@app.post("/workspace/rename-project")
def workspace_rename_project(payload: RenameProjectRequest) -> dict[str, str]:
    current = _validate_workspace_path(Path(payload.currentPath))
    if not current.exists() or not current.is_dir():
        raise HTTPException(status_code=404, detail="Project directory not found")

    safe_name = re.sub(r'[<>:"/\\|?*]', "_", payload.newName).strip()
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid project name")

    new_path = current.parent / safe_name
    if new_path.exists():
        raise HTTPException(status_code=409, detail="A folder with this name already exists")

    try:
        current.rename(new_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to rename project: {exc}")

    return {"rootPath": str(new_path), "name": safe_name}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8008, reload=False)
