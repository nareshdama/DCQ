# DCQ Development Roadmap

> Last updated: 2026-04-09
>
> This document is the single source of truth for DCQ development planning.
> It is written for **developers**, **AI coding agents**, and **QA/bug-fix agents**
> working on this codebase. Every phase includes the goal, the files affected,
> the implementation approach, acceptance criteria, and testing strategy.

---

## Architecture Snapshot (Current State)

```
gui-shell/          React 18 + Vite 6 + TypeScript SPA
  src/App.tsx        855-line root component, ~25 useState hooks
  src/api.ts         HTTP client for all bridge endpoints
  src/components/    PreviewPanel (Three.js), CodeEditor (CodeMirror), AI panels
  src/hooks/         useCadQueryRunner, useAIChat, useFileSystem, useExamples

gui-bridge/         FastAPI + CadQuery (Python 3.10+)
  server.py          Script execution via exec(), STL/STEP export, workspace CRUD
  ai_routes.py       SSE streaming AI chat endpoint
  ai_providers.py    OpenAI / Anthropic / Gemini / OpenRouter adapters

viewer/             Standalone Three.js STL viewer (Vite)
example-library/    40 curated CadQuery examples + index.json
tests/              Single unittest file (test_example_library.py)
```

**Key constraint:** CadQuery depends on OCCT (C++ kernel). All geometry operations
must happen server-side in Python. The browser receives tessellated meshes (STL).

---

## Phase 1 — Execution Robustness & Stability

**Goal:** Make script execution safe, cancellable, and non-blocking so the app
stays responsive under all conditions.

**Priority:** Critical — blocks all future phases.

### 1.1 Process Pool for Script Execution

**Problem:** `_execute_script()` in `server.py` calls `exec()` synchronously in
the main FastAPI process. A long-running CadQuery operation (complex booleans,
large fillets) blocks the entire server — health checks, AI streaming, workspace
ops all freeze.

**Files to modify:**
- `gui-bridge/server.py` — extract execution into subprocess

**Implementation:**

1. Create `gui-bridge/executor.py` with a `ScriptExecutor` class:
   ```python
   import concurrent.futures
   import multiprocessing

   class ScriptExecutor:
       def __init__(self, max_workers=2, timeout_seconds=120):
           self._pool = concurrent.futures.ProcessPoolExecutor(
               max_workers=max_workers,
               mp_context=multiprocessing.get_context("spawn"),
           )
           self._timeout = timeout_seconds

       def run(self, script: str, export_formats: list[str]) -> dict:
           future = self._pool.submit(_run_in_worker, script, export_formats)
           return future.result(timeout=self._timeout)
   ```
2. Move `_build_script_globals()`, `_execute_script()`, and export logic into
   a standalone `_run_in_worker()` function that can be pickled and sent to
   a child process.
3. In `server.py`, replace the direct `_execute_script()` call in the `/run`
   endpoint with `await asyncio.get_event_loop().run_in_executor(None, executor.run, ...)`.
4. Handle `concurrent.futures.TimeoutError` — return a structured error response
   with `ok: False` and a user-friendly "Script timed out after 120s" message.
5. Handle `ProcessPoolExecutor` worker crashes — return error, recreate pool.

**Acceptance criteria:**
- [ ] `/health` returns 200 within 500ms even while a script is running
- [ ] A script that runs `import time; time.sleep(200)` is killed after the timeout
- [ ] Two concurrent `/run` requests execute in parallel (up to max_workers)
- [ ] Worker crash does not bring down the FastAPI process

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| Timeout enforcement | Unit | Submit `time.sleep(999)`, assert TimeoutError within tolerance |
| Health during execution | Integration | Start long script, concurrently GET `/health`, assert 200 |
| Worker crash recovery | Unit | Submit script that calls `os._exit(1)`, then submit a valid script — must succeed |
| Parallel execution | Integration | Submit two scripts simultaneously, assert both return results |
| Existing examples pass | Regression | Run `test_example_library.py` — all must still pass |

**Bug-finder guidance:** After this change, watch for:
- Import errors in the worker process (CadQuery may need initialization per worker)
- Pickling failures if `_run_in_worker` captures unpicklable closures
- Orphaned child processes on Windows if the parent crashes — test `Ctrl+C` shutdown

---

### 1.2 Export File Cleanup

**Problem:** Every `/run` writes a new `{uuid}.stl` (and optionally `.step`) to
`gui-bridge/exports/`. In live-preview mode (1 run/second), this accumulates
~3,600 files per hour. No cleanup exists.

**Files to modify:**
- `gui-bridge/server.py` — add cleanup logic after writes

**Implementation:**

1. After each successful export write, scan `EXPORT_DIR` for files older than
   `EXPORT_TTL_SECONDS` (default 300 = 5 minutes) and delete them.
2. Use `pathlib.Path.stat().st_mtime` for age checks.
3. Limit cleanup to at most 50 deletions per invocation to avoid I/O spikes.
4. Keep the most recent `EXPORT_KEEP_COUNT` (default 10) files regardless of age
   as a safety net.
5. Add a `GET /exports/cleanup` admin endpoint for manual trigger.

**Acceptance criteria:**
- [ ] After 10 minutes of live-preview, `exports/` contains < 20 files
- [ ] The currently-displayed STL is never deleted mid-session
- [ ] Cleanup runs in < 50ms and does not block the response

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| TTL enforcement | Unit | Create 20 files with backdated mtime, run cleanup, assert only recent survive |
| Current file safety | Integration | Run script, note the STL URL, wait, run cleanup — the URL must still resolve |
| Performance | Unit | Create 1000 dummy files, assert cleanup completes in < 200ms |

---

### 1.3 Enhanced Error Diagnostics

**Problem:** `_parse_diagnostics()` only extracts line numbers from tracebacks
mentioning `File "<script>"`. The diagnostic message is always the generic string
`"Execution error"`. CadQuery raises specific exceptions (e.g., `StdFail_NotDone`,
`BRep_API: command not done`, `Selector found 0 objects`) that are never surfaced.

**Files to modify:**
- `gui-bridge/server.py` — improve `_parse_diagnostics()`
- `gui-shell/src/components/ConsolePanel.tsx` — render richer diagnostics
- `gui-shell/src/types.ts` — extend `Diagnostic` type

**Implementation:**

1. In `_parse_diagnostics()`, also parse the final exception line from the
   traceback (e.g., `ValueError: Script must set a 'result' variable...`) and
   use it as the `message` field instead of `"Execution error"`.
2. Add a `severity` field to diagnostics: `"error"` | `"warning"` | `"info"`.
3. Map known CadQuery/OCCT exceptions to user-friendly messages:
   ```python
   KNOWN_ERRORS = {
       "StdFail_NotDone": "Geometry operation failed — check fillet radii or boolean inputs",
       "found 0 objects": "Selector matched nothing — verify face/edge selector string",
       "BRep_API": "OCCT kernel error — the geometry may be invalid or degenerate",
   }
   ```
4. Update `Diagnostic` in `types.ts` to include `severity` and `detail` fields.
5. In `ConsolePanel.tsx`, color-code diagnostics by severity.

**Acceptance criteria:**
- [ ] A script with `cq.Workplane("XY").box(1,1,1).edges(">Q")` returns a
      diagnostic with the actual CadQuery error message, not just "Execution error"
- [ ] Known OCCT errors are mapped to user-friendly text
- [ ] Diagnostics display with color coding in the console panel

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| Exception parsing | Unit | Feed known tracebacks to `_parse_diagnostics()`, assert correct message and line |
| CadQuery error mapping | Unit | Execute scripts that trigger each known error class, verify mapping |
| Frontend rendering | Manual/E2E | Trigger each severity level, verify console styling |
| Regression | Regression | All existing examples must still produce zero diagnostics |

---

### 1.4 Script Cancellation

**Problem:** The live-preview `AbortController` in `useCadQueryRunner.ts` only
cancels the HTTP request. The Python script continues executing in the background,
consuming CPU and potentially producing stale exports.

**Files to modify:**
- `gui-bridge/server.py` — track running executions, add cancel endpoint
- `gui-bridge/executor.py` (new) — process cancellation support
- `gui-shell/src/hooks/useCadQueryRunner.ts` — call cancel on abort
- `gui-shell/src/api.ts` — add `cancelRun()` function

**Implementation:**

1. Assign a `run_id` to each `/run` request (already generating UUIDs for export names).
2. Return the `run_id` in the response and track the `Future` in a dict.
3. Add `POST /run/cancel` endpoint that accepts `{ runId }` and calls
   `future.cancel()` or kills the worker process.
4. In `useCadQueryRunner.ts`, when the abort controller fires, also call
   `cancelRun(runId)`.
5. For the process pool approach from 1.1, use `Process.terminate()` as a last
   resort for unresponsive workers.

**Acceptance criteria:**
- [ ] Cancelling a live-preview request stops the Python execution within 2s
- [ ] The cancelled run does not produce export files
- [ ] A new run can start immediately after cancellation

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| Cancel during execution | Integration | Start a `time.sleep(60)` script, cancel, assert response within 2s |
| No orphan exports | Integration | Cancel mid-export, verify no new files in exports/ |
| Rapid cancel-and-rerun | Integration | Cancel, immediately submit new script, assert correct result |

---

## Phase 2 — Multi-Object Scene Graph

**Goal:** Support multiple `show_object()` calls per script, return structured
scene metadata, and render a navigable scene tree in the viewer.

**Priority:** High — this is the feature that differentiates DCQ from a script runner.

### 2.1 Scene Manifest from Bridge

**Files to modify:**
- `gui-bridge/server.py` — `_build_script_globals()`, `_execute_script()`
- `gui-shell/src/types.ts` — add scene types

**Implementation:**

1. Change `show_object()` to append to a list instead of overwriting `_last_shown`:
   ```python
   def show_object(obj, name=None, options=None, **kwargs):
       entry = {
           "object": obj,
           "name": name or f"Object_{len(shown) + 1}",
           "options": options or {},
       }
       shown.append(entry)
       return obj
   ```
2. After execution, iterate over `shown` list. For each entry:
   - Export individual STL to `exports/{run_id}_{index}.stl`
   - Collect metadata: name, bounding box, triangle count, color (from options)
3. Return a `scene` array in the response:
   ```json
   {
     "ok": true,
     "scene": [
       {
         "name": "body",
         "stl": "/exports/abc_0.stl",
         "color": "#8E8E93",
         "visible": true,
         "bbox": { "min": [0,0,0], "max": [80,50,20] },
         "triangles": 1204
       },
       {
         "name": "housing",
         "stl": "/exports/abc_1.stl",
         "color": "#FF453A",
         "visible": true,
         "bbox": { "min": [-10,-10,0], "max": [90,60,30] },
         "triangles": 3842
       }
     ],
     "exports": { "stl": "/exports/abc_combined.stl" }
   }
   ```
4. Maintain backward compatibility: if the script only sets `result` without
   `show_object`, produce a single-entry scene array.

**Acceptance criteria:**
- [ ] A script calling `show_object()` 3 times returns 3 entries in `scene`
- [ ] Each entry has its own STL URL, name, and bounding box
- [ ] Old scripts that only set `result` still work unchanged
- [ ] `options={"color": "red"}` propagates to the scene entry

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| Multi-object manifest | Unit | Execute script with 3 `show_object` calls, assert `len(response["scene"]) == 3` |
| Single-result compat | Regression | Run all example-library scripts, assert valid scene array |
| Name inference | Unit | Call `show_object(box)` without name, assert auto-name `"Object_1"` |
| Color propagation | Unit | Call `show_object(box, options={"color": "red"})`, assert color in response |
| Empty script | Edge case | Script with no result/show_object still returns proper error |

---

### 2.2 Scene Tree UI Panel

**Files to create/modify:**
- `gui-shell/src/components/SceneTree.tsx` — new component
- `gui-shell/src/components/PreviewPanel.tsx` — load multiple meshes
- `gui-shell/src/hooks/useCadQueryRunner.ts` — expose scene data
- `gui-shell/src/types.ts` — scene types

**Implementation:**

1. Add `SceneObject` and `SceneManifest` types to `types.ts`:
   ```typescript
   type SceneObject = {
     name: string;
     stl: string;
     color: string;
     visible: boolean;
     bbox: { min: number[]; max: number[] };
     triangles: number;
   };
   ```
2. Create `SceneTree.tsx` — a collapsible list of scene objects with:
   - Visibility toggle (eye icon) per object
   - Color swatch (clicking opens color picker)
   - Selection highlight (click to focus camera on that object)
   - Triangle count badge
3. In `PreviewPanel.tsx`, load each scene object as a separate `Mesh`:
   - Maintain a `Map<string, Object3D>` keyed by object name
   - Apply per-object material color from the scene manifest
   - On visibility toggle, set `mesh.visible = false/true` and `requestRender()`
4. Compute combined bounding box for `fitCamera()` from all visible objects.
5. Wire into `App.tsx` sidebar — add "Scene" tab alongside Editor/AI/Examples/Files.

**Acceptance criteria:**
- [ ] 3 objects in script → 3 rows in scene tree panel
- [ ] Toggling visibility hides/shows the mesh in the viewport
- [ ] Clicking an object name fits the camera to that object's bounding box
- [ ] Color override in the scene tree updates the mesh material in real-time
- [ ] Single-object scripts show a one-entry scene tree (no regressions)

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| Multi-mesh loading | E2E | Script with 3 objects → viewport shows 3 distinct meshes |
| Visibility toggle | E2E | Hide object 2, assert only 2 meshes rendered |
| Camera fit to object | E2E | Click object name, assert camera target matches that object's center |
| Scene tree updates on re-run | E2E | Edit script, re-run, assert scene tree reflects new objects |
| Performance with 20 objects | Performance | Script producing 20 objects loads in < 3s |

**Bug-finder guidance:**
- Watch for race conditions: if the user re-runs while meshes are still loading,
  old meshes might not get cleaned up (`disposeObject` must be called).
- Memory leaks: each run creates new geometries. Verify `dispose()` is called on
  the old geometries when the scene is replaced.
- Z-fighting: overlapping objects at identical positions may flicker.

---

## Phase 3 — Editor Intelligence

**Goal:** Make the code editor CadQuery-aware with autocomplete, inline parameter
manipulation, and real-time error feedback.

**Priority:** High — core UX differentiator.
**Status:** Complete (2026-04-09)

**Completion note:** Phase 3 shipped with static CadQuery autocomplete,
selector-aware suggestions, inline parameter sliders with accelerated live preview,
and immediate syntax/runtime editor diagnostics. The optional dynamic
`POST /completions` follow-up from 3.1b remains a future enhancement rather than
part of the completed baseline scope.

### 3.1 CadQuery Autocomplete

**Files to modify:**
- `gui-shell/src/components/CodeEditor.tsx` — add completion extension
- `gui-bridge/server.py` — add `/completions` endpoint (optional, for dynamic completions)

**Implementation:**

1. Create a static CadQuery completion source for CodeMirror:
   - Build a JSON file `gui-shell/src/cq-completions.json` containing all
     `cq.Workplane` methods, `cq.Assembly` methods, common selectors, parameter
     names, and their docstring summaries.
   - Register as a CodeMirror `autocompletion` extension using `completeFromList()`.
2. For dynamic completions (Phase 3.1b), add `POST /completions`:
   - Accept `{ script, cursor_line, cursor_col }`
   - Use `jedi` or simple AST introspection to provide context-aware completions
   - Return `[{ label, type, detail }]`
3. Trigger completions on `.` after `cq`, `Workplane`, `result`, etc.

**Acceptance criteria:**
- [x] Typing `cq.Workplane("XY").` shows a dropdown with `box`, `cylinder`, `hole`, `fillet`, etc.
- [x] Each completion shows a brief description
- [x] Selectors like `">Z"`, `"|Z"`, `"#Z"` appear when inside `.faces()` or `.edges()`
- [x] Completions do not break normal typing flow (< 50ms response)

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| Static completions load | Unit | Assert completion list contains core Workplane methods |
| Trigger context | Unit | Simulate `.` after `cq.Workplane("XY")`, assert relevant completions |
| No false triggers | Unit | Typing normal Python (`for i in range`) does not show CQ completions |
| Performance | Unit | Completion lookup completes in < 50ms for full dictionary |

---

### 3.2 Inline Parameter Sliders

**Files to create/modify:**
- `gui-shell/src/components/ParameterOverlay.tsx` — new component
- `gui-shell/src/components/CodeEditor.tsx` — parameter detection
- `gui-shell/src/hooks/useCadQueryRunner.ts` — immediate re-run on slider change

**Implementation:**

1. Parse the script for top-level numeric assignments matching the pattern:
   ```regex
   ^(\w+)\s*=\s*(-?\d+\.?\d*)\s*(?:#.*)?$
   ```
   This captures `length = 80.0`, `fillet_radius = 3.0`, etc.
2. Render a floating panel above the editor showing each detected parameter with:
   - Name label
   - Current value (editable number input)
   - Range slider (auto-range: 0 to 3× current value, snapping to sensible steps)
   - Reset button (restore original value)
3. On slider change:
   - Update the script text at the specific line using `view.dispatch()` transaction
   - Trigger a live-preview run immediately (bypass the 1s debounce)
4. Parameters survive re-runs — detect which params changed vs which are new.

**Acceptance criteria:**
- [x] The starter script shows sliders for `length`, `width`, `height`, `fillet_radius`, `hole_diameter`
- [x] Dragging a slider updates the code AND triggers live preview
- [x] The 3D model updates smoothly as the slider moves
- [x] Adding a new variable to the script adds a new slider
- [x] Non-numeric or complex expressions (e.g., `x = 2 * pi`) are not shown as sliders

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| Parameter detection | Unit | Parse starter script, assert 5 parameters detected with correct values |
| Slider update → code change | E2E | Move slider, assert script text updates at correct line |
| Slider update → preview | E2E | Move slider, assert new STL is loaded within 2s |
| Edge: no params | Unit | Script with zero numeric assignments shows no sliders |
| Edge: string assignment | Unit | `name = "test"` is not detected as a parameter |
| Edge: expression | Unit | `x = math.pi * 2` is not detected as a simple parameter |

**Bug-finder guidance:**
- Slider dragging generates rapid updates. The debounce must be shorter (200ms)
  but cancellation of previous runs must work (Phase 1.4 dependency).
- Floating-point precision: slider step size must avoid values like `3.0000000001`.
- CodeMirror transactions must preserve cursor position and undo history.

---

### 3.3 Error Squiggles in Editor

**Files to modify:**
- `gui-shell/src/components/CodeEditor.tsx` — add lint extension
- `gui-shell/src/hooks/useCadQueryRunner.ts` — pipe diagnostics to editor

**Implementation:**

1. Use CodeMirror's `lintGutter()` and `setDiagnostics()` (already partially set up).
2. After each run, if `diagnostics` array is non-empty, map each diagnostic to a
   CodeMirror `Diagnostic`:
   ```typescript
   {
     from: lineStart,
     to: lineEnd,
     severity: diagnostic.severity || "error",
     message: diagnostic.message,
   }
   ```
3. Clear diagnostics at the start of each new run.
4. For syntax errors (detected by `compile()` before `exec()`), add immediate
   squiggles without waiting for execution.

**Acceptance criteria:**
- [x] A syntax error on line 5 shows a red underline on line 5 in the editor
- [x] A runtime error shows the squiggle on the correct line
- [x] Squiggles clear when the user edits the offending line
- [x] Hover over a squiggle shows the error message as a tooltip

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| Syntax error squiggle | E2E | Type `def foo(` (missing `):`), assert red marker on that line |
| Runtime error squiggle | E2E | Run `cq.Workplane("XY").box(1,1,1).fillet(999)`, assert squiggle |
| Clear on edit | E2E | Fix the error, assert squiggle disappears before next run |
| Multi-line errors | E2E | Script with errors on lines 3 and 7, assert both marked |

---

## Phase 4 — State Management Refactor

**Goal:** Extract the 25+ `useState` hooks from `App.tsx` into a proper store
to improve maintainability, testability, and support for new features.

**Priority:** Medium — tech debt that accelerates all future work.

### 4.1 Zustand Store Extraction

**Files to create/modify:**
- `gui-shell/src/store/index.ts` — new Zustand store
- `gui-shell/src/store/slices/editor.ts` — editor state slice
- `gui-shell/src/store/slices/preview.ts` — preview/scene state slice
- `gui-shell/src/store/slices/workspace.ts` — file/project state slice
- `gui-shell/src/store/slices/ui.ts` — layout and UI state slice
- `gui-shell/src/App.tsx` — replace useState hooks with store selectors

**Implementation:**

1. Install Zustand: `npm install zustand`
2. Create slices following Zustand's slice pattern:
   ```typescript
   // store/slices/editor.ts
   export type EditorSlice = {
     script: string;
     liveMode: boolean;
     setScript: (script: string) => void;
     toggleLiveMode: () => void;
   };
   ```
3. Each slice owns its `localStorage` persistence (replace `usePersistentState`).
4. Use Zustand's `persist` middleware for automatic serialization.
5. Migrate one slice at a time. Order: `ui` → `editor` → `workspace` → `preview`.
6. Keep `App.tsx` as the layout component. Business logic moves to store actions.

**Acceptance criteria:**
- [ ] `App.tsx` has zero `useState` calls — all state comes from the store
- [ ] All existing keyboard shortcuts still work
- [ ] All `localStorage` persistence still works (verify by refreshing)
- [ ] No visual or behavioral regressions
- [ ] Store is typed — no `any` types

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| State persistence | E2E | Set values, refresh page, assert values restored |
| Keyboard shortcuts | E2E | Test all Ctrl+R/E/K/S/N/O/P/L shortcuts |
| Store isolation | Unit | Modify editor slice, assert preview slice unchanged |
| Hydration | Unit | Pre-populate localStorage, create store, assert correct initial state |

---

## Phase 5 — AI-Powered CAD Intelligence

**Goal:** Evolve AI from a generic chat assistant into a context-aware CAD
engineering partner.

**Priority:** Medium — differentiator, but depends on Phases 1-3 being stable.

### 5.1 Contextual AI System Prompt

**Files to modify:**
- `gui-bridge/ai_providers.py` — enrich system prompt
- `gui-bridge/ai_routes.py` — accept additional context
- `gui-shell/src/hooks/useAIChat.ts` — send context with each message

**Implementation:**

1. Extend `AIChatRequest` to include:
   ```python
   class AIChatRequest(BaseModel):
       # ... existing fields ...
       currentCode: str = ""
       diagnostics: list[dict] = []       # current errors
       sceneManifest: list[dict] = []     # from Phase 2
       selectedObject: str | None = None  # name of selected object
   ```
2. Enrich the system prompt with structured context:
   ```
   Current errors: SyntaxError on line 12: unexpected indent
   Scene: 3 objects — "body" (1204 tris), "mounting_plate" (842 tris), "bolt_hole" (312 tris)
   Selected object: "mounting_plate"
   ```
3. Add specialized prompt sections:
   - If there are diagnostics → "The user likely needs help fixing this error"
   - If a scene object is selected → "The user is focused on {name}"
   - If the code is empty → "Help the user start a new CadQuery script"

**Acceptance criteria:**
- [ ] AI responses reference current errors when they exist
- [ ] AI understands which object is selected and can modify it specifically
- [ ] AI generates complete, runnable scripts (existing behavior preserved)

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| Error context sent | Integration | Create script with error, open AI, assert diagnostics in request payload |
| Scene context sent | Integration | Run multi-object script, open AI, assert scene manifest in payload |
| Prompt quality | Manual | Ask "fix this error" when there is one, verify AI addresses the actual error |

---

### 5.2 AI Parametric Exploration

**Files to create/modify:**
- `gui-shell/src/components/AIVariationsPanel.tsx` — new component
- `gui-bridge/server.py` — add `/run/batch` endpoint
- `gui-shell/src/hooks/useAIChat.ts` — add variation generation

**Implementation:**

1. Add `POST /run/batch` endpoint that accepts multiple scripts and returns
   multiple scene manifests:
   ```python
   class BatchRunRequest(BaseModel):
       scripts: list[str]  # up to 6 variations
       exportFormats: list[str] = ["stl"]
   ```
2. When the user asks "Generate variations of fillet radius" or clicks a
   "Explore Variations" button:
   - AI generates N script variations (e.g., fillet_radius = 1, 3, 5, 8, 12)
   - Frontend sends all to `/run/batch`
   - Display results in a 2×3 grid of mini-viewports
3. Clicking a variation applies it to the main editor and preview.

**Acceptance criteria:**
- [ ] "Explore Variations" generates 6 variations with visual previews
- [ ] Each mini-viewport is interactive (rotate/zoom)
- [ ] Clicking a variation updates the main editor and preview
- [ ] Batch execution completes within 30s for simple scripts

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| Batch execution | Unit | Submit 6 scripts, assert 6 results returned |
| Batch timeout | Unit | Submit 6 slow scripts, assert graceful timeout |
| Grid rendering | E2E | Assert 6 canvases rendered with distinct geometry |
| Apply variation | E2E | Click variation 3, assert main editor contains variation 3 code |

---

## Phase 6 — Testing Infrastructure

**Goal:** Build comprehensive test coverage for both Python bridge and TypeScript
frontend to enable confident refactoring and feature development.

**Priority:** Should run in parallel with Phases 1-3 — start immediately.

### 6.1 Python Test Suite

**Files to create/modify:**
- `tests/test_server.py` — new: API endpoint tests
- `tests/test_executor.py` — new: process pool tests (after Phase 1.1)
- `tests/test_diagnostics.py` — new: error parsing tests
- `tests/conftest.py` — new: shared fixtures
- `gui-bridge/requirements-dev.txt` — new: test dependencies

**Implementation:**

1. Create `requirements-dev.txt`:
   ```
   pytest>=8.0
   pytest-asyncio>=0.24
   httpx>=0.27        # for TestClient
   ```
2. Create `conftest.py` with a FastAPI `TestClient` fixture:
   ```python
   import pytest
   from fastapi.testclient import TestClient
   from server import app

   @pytest.fixture
   def client():
       return TestClient(app)
   ```
3. Write test modules covering:
   - `test_server.py`: All endpoints (run, health, examples, workspace CRUD, STEP conversion)
   - `test_executor.py`: Timeout, cancellation, crash recovery, parallel execution
   - `test_diagnostics.py`: All error patterns, CadQuery-specific error mapping

**Acceptance criteria:**
- [ ] `pytest tests/` runs all tests including the existing `test_example_library.py`
- [ ] At least 80% line coverage on `server.py`
- [ ] Tests complete in < 60s
- [ ] Tests are independent (no shared state between test functions)

**QA & testing:**

| Test | Type | Method |
|------|------|--------|
| /run success | Unit | POST valid CadQuery script, assert `ok: True` |
| /run failure | Unit | POST invalid script, assert `ok: False` with diagnostics |
| /health | Unit | GET /health, assert 200 and `{"status": "ok"}` |
| /examples list | Unit | GET /examples, assert count matches filesystem |
| /workspace/open | Unit | POST valid path, assert code returned |
| /workspace/open (403) | Unit | POST path outside allowed roots, assert 403 |
| /workspace/create-project | Unit | POST name, assert directory created |

---

### 6.2 Frontend Test Suite

**Files to create/modify:**
- `gui-shell/vitest.config.ts` — new
- `gui-shell/src/hooks/__tests__/useCadQueryRunner.test.ts` — new
- `gui-shell/src/hooks/__tests__/useFileSystem.test.ts` — new
- `gui-shell/src/hooks/__tests__/useAIChat.test.ts` — new
- `gui-shell/src/components/__tests__/CommandPalette.test.tsx` — new
- `gui-shell/package.json` — add vitest + testing-library deps

**Implementation:**

1. Install test dependencies:
   ```
   npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
   ```
2. Create `vitest.config.ts`:
   ```typescript
   import { defineConfig } from 'vitest/config';
   export default defineConfig({
     test: {
       environment: 'jsdom',
       globals: true,
       setupFiles: ['./src/test-setup.ts'],
     },
   });
   ```
3. Write hook tests with `@testing-library/react`'s `renderHook()`:
   - `useCadQueryRunner`: mock `fetch`, test execute/status/error flows
   - `useFileSystem`: mock File System Access API, test open/save/dirty tracking
   - `useAIChat`: mock SSE stream, test message accumulation and code extraction
4. Write component tests for interactive components:
   - `CommandPalette`: search filtering, keyboard navigation, action execution

**Acceptance criteria:**
- [ ] `npm test` runs all frontend tests
- [ ] Hook tests cover success, error, and edge-case paths
- [ ] Tests complete in < 30s
- [ ] No flaky tests — all deterministic with mocked I/O

---

### 6.3 End-to-End Tests

**Files to create/modify:**
- `e2e/playwright.config.ts` — new
- `e2e/tests/run-preview.spec.ts` — new
- `e2e/tests/ai-chat.spec.ts` — new
- `e2e/tests/file-operations.spec.ts` — new

**Implementation:**

1. Install Playwright: `npx playwright install`
2. Configure to start both bridge and shell before tests.
3. Write E2E tests for critical user flows:
   - Open app → type script → click Run → verify preview shows geometry
   - Edit script → live preview updates automatically
   - Open example → verify it loads and runs
   - Open AI chat → send message → verify response streams
   - Create project → verify files created → open file → edit → save

**Acceptance criteria:**
- [ ] E2E tests run against a real bridge + shell stack
- [ ] Critical path (edit → run → preview) passes reliably
- [ ] Tests complete in < 120s
- [ ] CI-compatible (headless browser)

---

## Phase 7 — Professional CAD Features

**Goal:** Add measurement, analysis, and advanced export capabilities that
professional engineers expect.

**Priority:** Lower — long-term roadmap.

### 7.1 Measurement Tools

- Point-to-point distance measurement in the viewport
- Surface area and volume display in the inspector
- Angle measurement between faces
- **Implementation:** Raycast two points, compute Euclidean distance, render
  overlay annotation with Three.js `CSS2DRenderer`

### 7.2 Section Views

- Clipping plane that slices through the model
- Interactive plane positioning (drag handle or numeric input)
- Cross-section outline highlighting
- **Implementation:** Three.js `clippingPlanes` on the material + stencil buffer
  for the cross-section outline

### 7.3 Advanced Export

- DXF/SVG 2D projection export (via CadQuery's `exporters.exportDXF`)
- 3MF export with color metadata
- OBJ export with materials
- **Implementation:** Add format options to the `/run` endpoint, extend
  `ExportFormat` type, add download buttons in the export inspector tab

### 7.4 Assembly BOM

- Parse assembly structure from `cq.Assembly` scripts
- Generate a Bill of Materials table (part name, quantity, material, volume)
- Export BOM as CSV
- **Implementation:** Inspect `cq.Assembly` objects in `_execute_script`,
  traverse the assembly tree, return structured BOM data

---

## Phase 8 — Deployment & Distribution

**Goal:** Make DCQ installable and deployable beyond a local dev setup.

### 8.1 Docker Image

- Single Dockerfile with Python + Node multi-stage build
- Vite production build served by FastAPI's `StaticFiles`
- Health check endpoint already exists
- Environment variables for port, allowed origins, export TTL

### 8.2 Desktop App (Electron/Tauri)

- Package the Vite build + Python bridge as a desktop app
- Tauri preferred (smaller binary, native webview)
- Python sidecar process managed by the Tauri backend
- File system access through native dialogs instead of browser API

### 8.3 Cloud Deployment

- Sandboxed execution (Firecracker/gVisor per session)
- User authentication and session management
- Project storage (S3/R2 for exports, database for metadata)
- Rate limiting on `/run` and `/ai/chat`

---

## Cross-Cutting Concerns

### API Contract Enforcement

FastAPI generates OpenAPI schemas automatically. Adopt typed client generation:

1. Export OpenAPI JSON: `GET /openapi.json` (FastAPI provides this free)
2. Generate TypeScript types: `npx openapi-typescript http://localhost:8008/openapi.json -o src/api-types.ts`
3. Replace manual type definitions in `types.ts` with generated types
4. Run generation in CI to catch contract drift

### Performance Budgets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first render | < 2s | Lighthouse / Web Vitals |
| Live preview latency (simple script) | < 1.5s end-to-end | Custom timer in useCadQueryRunner |
| STL load time (< 5MB) | < 500ms | Performance mark in PreviewPanel |
| AI first token | < 2s | Timer in useAIChat |
| Bundle size (initial) | < 500KB gzipped | `vite build` output |

### Security Checklist (Per Phase)

- [ ] No `exec()` in the main process (Phase 1.1)
- [ ] Export paths validated against traversal (already done)
- [ ] Workspace paths validated against allowed roots (already done)
- [ ] AI API keys never logged or persisted server-side (already done)
- [ ] CORS restricted to known origins (already done)
- [ ] Rate limiting on public endpoints (Phase 8.3)
- [ ] Input size limits on script length and file uploads (add to Phase 1)

---

## Dependency on Phase Order

```
Phase 1 (Execution Robustness)
  ├── Phase 2 (Scene Graph) ← needs stable execution
  │     └── Phase 5.1 (Contextual AI) ← needs scene manifest
  │           └── Phase 5.2 (AI Variations) ← needs batch execution
  ├── Phase 3 (Editor Intelligence) ← can start in parallel with Phase 2
  │     └── Phase 3.2 (Sliders) ← needs cancellation from Phase 1.4
  └── Phase 4 (State Refactor) ← can start after Phase 2

Phase 6 (Testing) ← start immediately, runs in parallel with everything

Phase 7 (Pro CAD Features) ← after Phase 2
Phase 8 (Deployment) ← after Phase 1
```

---

## For AI Coding Agents

When working on any task in this codebase:

1. **Check the phase** — identify which roadmap phase the task belongs to.
2. **Check dependencies** — verify prerequisite phases are complete.
3. **Read acceptance criteria** — these are your definition of done.
4. **Run existing tests first** — `cd tests && python -m pytest` for Python,
   `cd gui-shell && npm test` for frontend (once Phase 6.2 is done).
5. **Follow file locations** — each phase lists exactly which files to modify.
6. **Preserve backward compatibility** — old scripts must keep working.

## For Bug Finders

When investigating a bug:

1. **Identify the layer** — is it bridge (Python), shell (TypeScript), or viewer (Three.js)?
2. **Check the relevant phase** — the bug-finder guidance sections list known risk areas.
3. **Reproduce with minimal script** — CadQuery bugs often reduce to a single chain call.
4. **Check the console panel** — diagnostics from the bridge appear there.
5. **Check browser DevTools Network tab** — verify the `/run` response shape.
6. **Check for race conditions** — live preview + manual run + AI apply can collide.

## For Bug Fixers

When fixing a bug:

1. **Write a failing test first** — add to the appropriate `tests/test_*.py` or `__tests__/*.test.ts`.
2. **Fix in the narrowest scope** — prefer fixing in the hook/utility over the component.
3. **Verify acceptance criteria** — the fix should not regress any listed criteria.
4. **Run the full test suite** — not just the test you added.
5. **Check the cleanup** — if fixing a resource leak, verify dispose/cleanup paths.
