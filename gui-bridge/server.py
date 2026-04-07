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

app = FastAPI(title="CadQuery GUI Bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"],
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
