"""
Process-pool executor for CadQuery script execution.

Isolates user scripts in child processes so the FastAPI server stays responsive.
Uses ``spawn`` context to avoid OCCT/CadQuery fork-safety issues on all platforms.

Design notes:
- Each worker imports CadQuery fresh (spawn context = clean process).
- Results are serialized as plain dicts (no CadQuery objects cross the boundary).
- Export files are written inside the worker; only paths are returned.
- On Windows, ``spawn`` is the only safe context for multiprocessing with OCCT.
"""

from __future__ import annotations

import concurrent.futures
import io
import logging
import multiprocessing
import time
import traceback
import uuid
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

DEFAULT_MAX_WORKERS = 2
DEFAULT_TIMEOUT_SECONDS = 120
DEFAULT_UNIT = "mm"
STL_LINEAR_DEFLECTION_MM = 0.05
STL_ANGULAR_DEFLECTION_RAD = 0.1

# ── Known CadQuery / OCCT error mappings ─────────────────────────────────────

KNOWN_ERRORS: dict[str, str] = {
    "StdFail_NotDone": (
        "Geometry operation failed — check fillet radii or boolean inputs"
    ),
    "found 0 objects": (
        "Selector matched nothing — verify face/edge selector string"
    ),
    "BRep_API": (
        "OCCT kernel error — the geometry may be invalid or degenerate"
    ),
    "not done": (
        "Operation did not complete — geometry may be too complex or degenerate"
    ),
    "Selector found no": (
        "Selector matched nothing — verify your selector expression"
    ),
}

# ── Diagnostic parsing ───────────────────────────────────────────────────────


def parse_diagnostics(error_text: str) -> list[dict[str, Any]]:
    """
    Extract structured diagnostics from a Python traceback string.

    Parses line numbers from ``File "<script>"`` references and extracts the
    final exception line for a meaningful error message. Maps known CadQuery/OCCT
    exceptions to user-friendly descriptions.

    Args:
        error_text: Full traceback text from script execution.

    Returns:
        List of diagnostic dicts, each with keys:
        - ``line`` (int): 1-based line number in the user script
        - ``message`` (str): Human-readable error description
        - ``severity`` ("error" | "warning" | "info"): Severity level
        - ``detail`` (str | None): Raw exception text when a friendly mapping exists
    """
    diagnostics: list[dict[str, Any]] = []
    lines = error_text.splitlines()

    # Extract the final exception message from the traceback
    final_exception = _extract_final_exception(lines)
    friendly_message = _map_to_friendly_message(final_exception)

    for line in lines:
        if ", line " in line and 'File "<script>"' in line:
            try:
                line_number = int(line.split(", line ")[1].split(",")[0])
            except (ValueError, IndexError):
                continue

            message = friendly_message or final_exception or "Execution error"
            detail = final_exception if friendly_message else None

            diagnostics.append({
                "line": line_number,
                "message": message,
                "severity": "error",
                "detail": detail,
            })

    # If we found an exception but no script line references, add a general diagnostic
    if not diagnostics and final_exception:
        message = friendly_message or final_exception
        detail = final_exception if friendly_message else None
        diagnostics.append({
            "line": 1,
            "message": message,
            "severity": "error",
            "detail": detail,
        })

    return diagnostics


def _extract_final_exception(lines: list[str]) -> str | None:
    """
    Walk the traceback lines backwards to find the final exception line.

    Args:
        lines: Traceback split into individual lines.

    Returns:
        The exception message string, or None if not found.
    """
    for line in reversed(lines):
        stripped = line.strip()
        if not stripped:
            continue
        # Exception lines typically look like: "ValueError: some message"
        # or "cadquery.occ_impl.shapes.SomeError: message"
        if "Error" in stripped or "Exception" in stripped or ":" in stripped:
            # Skip traceback context lines (File "...", line N)
            if stripped.startswith("File ") or stripped.startswith("During handling"):
                continue
            # Skip lines that are just code context
            if stripped.startswith("^") or stripped.startswith("~"):
                continue
            return stripped
    return None


def _map_to_friendly_message(exception_text: str | None) -> str | None:
    """
    Map a raw exception string to a user-friendly message using KNOWN_ERRORS.

    Args:
        exception_text: Raw exception text from traceback.

    Returns:
        Friendly message string if a known pattern matches, else None.
    """
    if not exception_text:
        return None
    for pattern, friendly in KNOWN_ERRORS.items():
        if pattern.lower() in exception_text.lower():
            return friendly
    return None


# ── Worker function (runs in child process) ──────────────────────────────────


DEFAULT_OBJECT_COLOR = "#8E8E93"

# CSS named colors to hex for normalizing user-provided colors
_CSS_COLOR_MAP: dict[str, str] = {
    "red": "#FF3B30", "green": "#34C759", "blue": "#007AFF",
    "yellow": "#FFCC00", "orange": "#FF9500", "purple": "#AF52DE",
    "pink": "#FF2D55", "gray": "#8E8E93", "grey": "#8E8E93",
    "white": "#FFFFFF", "black": "#1C1C1E", "cyan": "#32D7E0",
    "magenta": "#FF2D55", "brown": "#A2845E",
}


def _normalize_color(color: Any) -> str:
    """
    Normalize a user-provided color value to a hex string.

    Accepts hex strings (with or without ``#``), CSS named colors, and
    RGB tuples ``(r, g, b)`` with values in 0-1 or 0-255 range.

    Args:
        color: Color value from ``show_object`` options.

    Returns:
        Hex color string like ``"#FF3B30"``. Returns DEFAULT_OBJECT_COLOR
        if the input cannot be parsed.
    """
    if color is None:
        return DEFAULT_OBJECT_COLOR

    if isinstance(color, str):
        stripped = color.strip().lower()
        if stripped in _CSS_COLOR_MAP:
            return _CSS_COLOR_MAP[stripped]
        if stripped.startswith("#") and len(stripped) in (4, 7):
            return stripped.upper()
        if len(stripped) == 6:
            try:
                int(stripped, 16)
                return f"#{stripped.upper()}"
            except ValueError:
                pass
        return DEFAULT_OBJECT_COLOR

    if isinstance(color, (list, tuple)) and len(color) >= 3:
        try:
            r, g, b = float(color[0]), float(color[1]), float(color[2])
            # If all values <= 1.0, treat as 0-1 range
            if all(0.0 <= v <= 1.0 for v in (r, g, b)):
                r, g, b = int(r * 255), int(g * 255), int(b * 255)
            else:
                r, g, b = int(r), int(g), int(b)
            r = max(0, min(255, r))
            g = max(0, min(255, g))
            b = max(0, min(255, b))
            return f"#{r:02X}{g:02X}{b:02X}"
        except (ValueError, TypeError):
            pass

    return DEFAULT_OBJECT_COLOR


def _compute_bounding_box(cq_object: Any) -> dict[str, list[float]]:
    """
    Compute the axis-aligned bounding box of a CadQuery object.

    Args:
        cq_object: A CadQuery Workplane, Shape, or Assembly.

    Returns:
        Dict with ``"min"`` and ``"max"`` keys, each a ``[x, y, z]`` list.
        Returns a zero-size box at origin if computation fails.
    """
    try:
        # CadQuery Workplane has .val() → Shape, or .findSolid()
        shape = None
        if hasattr(cq_object, "findSolid"):
            shape = cq_object.findSolid()
        elif hasattr(cq_object, "val"):
            shape = cq_object.val()
        elif hasattr(cq_object, "BoundingBox"):
            shape = cq_object

        if shape is not None and hasattr(shape, "BoundingBox"):
            bb = shape.BoundingBox()
            return {
                "min": [round(bb.xmin, 4), round(bb.ymin, 4), round(bb.zmin, 4)],
                "max": [round(bb.xmax, 4), round(bb.ymax, 4), round(bb.zmax, 4)],
            }
    except Exception:
        pass

    return {"min": [0.0, 0.0, 0.0], "max": [0.0, 0.0, 0.0]}


def _count_triangles_from_stl(stl_path: Path) -> int:
    """
    Count the number of triangles in an STL file by reading its size.

    For binary STL files, the triangle count is stored at byte offset 80-84.
    For ASCII files, we fall back to line counting.

    Args:
        stl_path: Path to the STL file.

    Returns:
        Approximate triangle count, or 0 if the file cannot be read.
    """
    try:
        with open(stl_path, "rb") as f:
            header = f.read(80)
            # Check if it's ASCII STL
            if header[:5] == b"solid" and b"\x00" not in header:
                # ASCII — count "facet" lines
                f.seek(0)
                content = f.read().decode("ascii", errors="ignore")
                return content.count("facet normal")
            # Binary STL — triangle count at offset 80
            count_bytes = f.read(4)
            if len(count_bytes) == 4:
                return int.from_bytes(count_bytes, byteorder="little")
    except Exception:
        pass
    return 0


def _export_single_object(
    cq_object: Any,
    exporters_module: Any,
    export_path: Path,
    run_id: str,
    index: int,
    export_formats: list[str],
) -> dict[str, Any]:
    """
    Export a single CadQuery object to STL and/or STEP files.

    Args:
        cq_object: The CadQuery Workplane/Shape to export.
        exporters_module: The ``cadquery.exporters`` module (already imported in worker).
        export_path: Directory where export files are written.
        run_id: Unique execution identifier.
        index: Object index within the scene (used in filenames).
        export_formats: List of requested formats ("stl", "step").

    Returns:
        Dict with ``stl`` and/or ``step`` URL paths, plus ``triangles`` count.
    """
    result: dict[str, Any] = {"triangles": 0}

    if "stl" in export_formats:
        stl_name = f"{run_id}_{index}.stl"
        stl_path = export_path / stl_name
        exporters_module.export(
            cq_object,
            str(stl_path),
            exportType="STL",
            tolerance=STL_LINEAR_DEFLECTION_MM,
            angularTolerance=STL_ANGULAR_DEFLECTION_RAD,
        )
        result["stl"] = f"/exports/{stl_name}"
        result["triangles"] = _count_triangles_from_stl(stl_path)

    if "step" in export_formats:
        step_name = f"{run_id}_{index}.step"
        step_path = export_path / step_name
        exporters_module.export(cq_object, str(step_path), exportType="STEP")
        result["step"] = f"/exports/{step_name}"

    return result


# DESIGN NOTE: _run_in_worker is the subprocess entry point. It must be a
# module-level function (not a method) so it can be pickled by ProcessPoolExecutor.
# CadQuery is imported inside the function because spawn-context workers start fresh.


def _run_in_worker(
    script: str,
    export_formats: list[str],
    export_dir: str,
    run_id: str,
) -> dict[str, Any]:
    """
    Execute a CadQuery script in an isolated worker process.

    Supports multiple ``show_object()`` calls per script. Each call accumulates
    an entry in the scene manifest with its own STL export, bounding box, color,
    and triangle count. Single-object scripts (using ``result = ...``) produce a
    one-entry scene array for backward compatibility.

    Args:
        script: Python source code to execute.
        export_formats: List of export format strings ("stl", "step").
        export_dir: Absolute path to the exports directory.
        run_id: Unique identifier for this execution (used in filenames).

    Returns:
        Dict with keys: ok, stdout, stderr, exports, scene, preset, diagnostics,
        run_id, execution_time_ms.
    """
    start_time = time.monotonic()
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    exports_payload: dict[str, str] = {}
    export_path = Path(export_dir)

    try:
        import cadquery as cq
        from cadquery import exporters

        # Accumulator for show_object() calls — each entry is a dict with
        # "object", "name", and "options" keys.
        shown_objects: list[dict[str, Any]] = []

        script_globals: dict[str, Any] = {
            "cq": cq,
            "cadquery": cq,
            "__name__": "__main__",
        }

        def show_object(
            obj: Any,
            name: str | None = None,
            options: dict[str, Any] | None = None,
            **kwargs: Any,
        ) -> Any:
            """
            CQ-editor compatible show_object shim with multi-object support.

            Each call appends an entry to the scene manifest. Accepts optional
            ``name`` and ``options`` (e.g., ``{"color": "red"}``) parameters.
            """
            entry_name = name or f"Object_{len(shown_objects) + 1}"
            entry_options = dict(options or {})
            # Merge any extra kwargs into options for flexibility
            entry_options.update(kwargs)
            shown_objects.append({
                "object": obj,
                "name": entry_name,
                "options": entry_options,
            })
            return obj

        script_globals["show_object"] = show_object

        compiled = compile(script, "<script>", "exec")
        with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
            exec(compiled, script_globals)

        # Build the scene from show_object() calls or the result variable.
        # If the script used show_object(), those entries form the scene.
        # If it only set a `result` variable, wrap it as a single scene entry.
        # If both exist, show_object() entries take precedence (CQ-editor behavior).
        if not shown_objects:
            result_obj = script_globals.get("result")
            if result_obj is None:
                raise ValueError(
                    "Script must set a `result` variable or call `show_object(...)`."
                )
            shown_objects.append({
                "object": result_obj,
                "name": "result",
                "options": {},
            })

        # Export each scene object individually
        scene: list[dict[str, Any]] = []
        combined_result = shown_objects[0]["object"]  # For combined export

        for index, entry in enumerate(shown_objects):
            obj = entry["object"]
            obj_name = entry["name"]
            obj_options = entry["options"]

            # Extract color from options
            color = _normalize_color(
                obj_options.get("color", obj_options.get("colour"))
            )

            # Export this object
            obj_exports = _export_single_object(
                obj, exporters, export_path, run_id, index, export_formats
            )

            # Compute bounding box
            bbox = _compute_bounding_box(obj)

            scene_entry: dict[str, Any] = {
                "name": obj_name,
                "color": color,
                "visible": True,
                "bbox": bbox,
                "triangles": obj_exports.get("triangles", 0),
            }
            if "stl" in obj_exports:
                scene_entry["stl"] = obj_exports["stl"]
            if "step" in obj_exports:
                scene_entry["step"] = obj_exports["step"]

            scene.append(scene_entry)

        # Combined export for the first/primary object (backward compatibility)
        if "stl" in export_formats and scene:
            # Use the first object's STL as the combined one if single object,
            # otherwise export the first object under the standard name too
            if len(scene) == 1 and "stl" in scene[0]:
                exports_payload["stl"] = scene[0]["stl"]
            else:
                # Export the first object under the legacy combined name
                combined_stl_name = f"{run_id}.stl"
                combined_stl_path = export_path / combined_stl_name
                exporters.export(
                    combined_result,
                    str(combined_stl_path),
                    exportType="STL",
                    tolerance=STL_LINEAR_DEFLECTION_MM,
                    angularTolerance=STL_ANGULAR_DEFLECTION_RAD,
                )
                exports_payload["stl"] = f"/exports/{combined_stl_name}"

        if "step" in export_formats and scene:
            if len(scene) == 1 and "step" in scene[0]:
                exports_payload["step"] = scene[0]["step"]
            else:
                combined_step_name = f"{run_id}.step"
                combined_step_path = export_path / combined_step_name
                exporters.export(
                    combined_result, str(combined_step_path), exportType="STEP"
                )
                exports_payload["step"] = f"/exports/{combined_step_name}"

        elapsed_ms = round((time.monotonic() - start_time) * 1000)

        return {
            "ok": True,
            "stdout": stdout_buffer.getvalue(),
            "stderr": stderr_buffer.getvalue(),
            "exports": exports_payload,
            "scene": scene,
            "preset": {
                "profile": "industry-cad-defaults",
                "unit": DEFAULT_UNIT,
                "stlLinearDeflectionMm": STL_LINEAR_DEFLECTION_MM,
                "stlAngularDeflectionRad": STL_ANGULAR_DEFLECTION_RAD,
            },
            "diagnostics": [],
            "run_id": run_id,
            "execution_time_ms": elapsed_ms,
        }

    except Exception:
        traceback_text = traceback.format_exc()
        elapsed_ms = round((time.monotonic() - start_time) * 1000)

        return {
            "ok": False,
            "stdout": stdout_buffer.getvalue(),
            "stderr": traceback_text,
            "exports": exports_payload,
            "scene": [],
            "diagnostics": parse_diagnostics(traceback_text),
            "run_id": run_id,
            "execution_time_ms": elapsed_ms,
        }


# ── Export cleanup ───────────────────────────────────────────────────────────

EXPORT_TTL_SECONDS = 300  # 5 minutes
EXPORT_KEEP_COUNT = 10
EXPORT_CLEANUP_BATCH = 50


def cleanup_exports(
    export_dir: Path,
    ttl_seconds: int = EXPORT_TTL_SECONDS,
    keep_count: int = EXPORT_KEEP_COUNT,
    max_deletions: int = EXPORT_CLEANUP_BATCH,
    protected_files: set[str] | None = None,
) -> int:
    """
    Remove stale export files that exceed the TTL, keeping recent files safe.

    Scans the export directory for ``.stl`` and ``.step`` files, sorts by
    modification time, and deletes the oldest files that are past the TTL —
    but always retains at least ``keep_count`` files regardless of age.

    Args:
        export_dir: Path to the exports directory.
        ttl_seconds: Maximum file age in seconds before eligible for deletion.
        keep_count: Minimum number of recent files to keep regardless of age.
        max_deletions: Maximum files to delete per invocation (prevents I/O spikes).
        protected_files: Set of filenames that must not be deleted (e.g., currently served).

    Returns:
        Number of files actually deleted.
    """
    protected = protected_files or set()
    now = time.time()
    deleted = 0

    try:
        candidates = [
            f for f in export_dir.iterdir()
            if f.is_file() and f.suffix.lower() in {".stl", ".step", ".stp"}
        ]
    except OSError as exc:
        logger.warning("Export cleanup failed to list directory: %s", exc)
        return 0

    # Sort by modification time, newest first
    candidates.sort(key=lambda f: f.stat().st_mtime, reverse=True)

    # Always keep the most recent `keep_count` files
    eligible = candidates[keep_count:]

    for file_path in eligible:
        if deleted >= max_deletions:
            break
        if file_path.name in protected:
            continue
        try:
            age = now - file_path.stat().st_mtime
            if age > ttl_seconds:
                file_path.unlink(missing_ok=True)
                deleted += 1
        except OSError as exc:
            logger.debug("Failed to delete export file %s: %s", file_path, exc)

    return deleted


# ── ScriptExecutor class ─────────────────────────────────────────────────────


class ScriptExecutor:
    """
    Manages a process pool for executing CadQuery scripts safely.

    Provides non-blocking script execution, timeout enforcement, cancellation,
    and automatic recovery from worker crashes.

    Args:
        export_dir: Path where export files (STL, STEP) are written.
        max_workers: Maximum concurrent worker processes.
        timeout_seconds: Default per-script timeout.

    Example::

        executor = ScriptExecutor(export_dir=Path("./exports"))
        result = executor.run("result = cq.Workplane('XY').box(10, 10, 10)", ["stl"])
        print(result["exports"])  # {"stl": "/exports/abc123.stl"}
    """

    def __init__(
        self,
        export_dir: Path,
        max_workers: int = DEFAULT_MAX_WORKERS,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._export_dir = export_dir
        self._max_workers = max_workers
        self._timeout = timeout_seconds
        self._pool: concurrent.futures.ProcessPoolExecutor | None = None
        self._active_futures: dict[str, concurrent.futures.Future] = {}
        self._lock = __import__("threading").Lock()

    def _ensure_pool(self) -> concurrent.futures.ProcessPoolExecutor:
        """
        Lazily create or recreate the process pool.

        Returns:
            The active ProcessPoolExecutor instance.
        """
        if self._pool is None:
            self._pool = concurrent.futures.ProcessPoolExecutor(
                max_workers=self._max_workers,
                mp_context=multiprocessing.get_context("spawn"),
            )
        return self._pool

    def run(
        self,
        script: str,
        export_formats: list[str] | None = None,
        timeout: int | None = None,
        run_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Execute a CadQuery script in a worker process.

        Submits the script to the process pool, waits for completion up to
        the timeout, and returns the result dict. If the worker crashes or
        times out, returns a structured error response and recreates the pool.

        Args:
            script: Python source code to execute.
            export_formats: List of export format strings ("stl", "step").
            timeout: Per-call timeout override in seconds.

        Returns:
            Dict with keys: ok, stdout, stderr, exports, diagnostics, run_id,
            execution_time_ms. Always returns — never raises.
        """
        export_formats = export_formats or []
        timeout = timeout or self._timeout
        run_id = run_id or uuid.uuid4().hex[:12]

        try:
            pool = self._ensure_pool()
            future = pool.submit(
                _run_in_worker,
                script,
                export_formats,
                str(self._export_dir),
                run_id,
            )

            with self._lock:
                self._active_futures[run_id] = future

            try:
                result = future.result(timeout=timeout)
            finally:
                with self._lock:
                    self._active_futures.pop(run_id, None)

            return result

        except concurrent.futures.TimeoutError:
            with self._lock:
                self._active_futures.pop(run_id, None)
            future.cancel()
            self._recreate_pool()
            return {
                "ok": False,
                "stdout": "",
                "stderr": f"Script timed out after {timeout}s. "
                          f"The execution was cancelled.",
                "exports": {},
                "diagnostics": [{
                    "line": 1,
                    "message": f"Script execution timed out after {timeout} seconds",
                    "severity": "error",
                    "detail": None,
                }],
                "run_id": run_id,
                "execution_time_ms": timeout * 1000,
            }

        except concurrent.futures.BrokenExecutor:
            with self._lock:
                self._active_futures.pop(run_id, None)
            self._recreate_pool()
            return {
                "ok": False,
                "stdout": "",
                "stderr": "Worker process crashed. The execution pool has been "
                          "restarted — please try again.",
                "exports": {},
                "diagnostics": [{
                    "line": 1,
                    "message": "Worker process crashed unexpectedly",
                    "severity": "error",
                    "detail": None,
                }],
                "run_id": run_id,
                "execution_time_ms": 0,
            }

        except Exception as exc:
            with self._lock:
                self._active_futures.pop(run_id, None)
            return {
                "ok": False,
                "stdout": "",
                "stderr": f"Execution infrastructure error: {exc}",
                "exports": {},
                "diagnostics": [{
                    "line": 1,
                    "message": f"Internal error: {type(exc).__name__}: {exc}",
                    "severity": "error",
                    "detail": None,
                }],
                "run_id": run_id,
                "execution_time_ms": 0,
            }

    def cancel(self, run_id: str) -> bool:
        """
        Cancel a running script execution by its run_id.

        Attempts to cancel the Future. If the Future is already running in the
        worker, cancellation requires killing the worker process — which the
        pool handles by spawning a replacement.

        Args:
            run_id: The unique execution identifier returned in the run response.

        Returns:
            True if cancellation was requested, False if the run_id was not found.
        """
        with self._lock:
            future = self._active_futures.pop(run_id, None)

        if future is None:
            return False

        cancelled = future.cancel()
        if not cancelled and future.running():
            # Future is already executing — we need to kill the worker.
            # Recreating the pool terminates all workers, which is aggressive
            # but safe. A more surgical approach would track PIDs per future,
            # but that adds complexity for minimal gain at max_workers=2.
            self._recreate_pool()

        return True

    def _recreate_pool(self) -> None:
        """
        Shut down the current pool and clear the reference so it is recreated lazily.

        Existing futures are cancelled. Workers are terminated (not waited on
        indefinitely) to avoid hanging on stubborn OCCT operations.
        """
        old_pool = self._pool
        self._pool = None
        if old_pool is not None:
            try:
                old_pool.shutdown(wait=False, cancel_futures=True)
            except Exception as exc:
                logger.warning("Error shutting down executor pool: %s", exc)

    def shutdown(self) -> None:
        """
        Cleanly shut down the process pool. Call on application exit.
        """
        with self._lock:
            self._active_futures.clear()
        if self._pool is not None:
            try:
                self._pool.shutdown(wait=True, cancel_futures=True)
            except Exception as exc:
                logger.warning("Error during executor shutdown: %s", exc)
            self._pool = None

    @property
    def active_run_ids(self) -> list[str]:
        """
        Return a snapshot of currently active run IDs.

        Returns:
            List of run_id strings for in-progress executions.
        """
        with self._lock:
            return list(self._active_futures.keys())
