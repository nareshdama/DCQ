from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import ModuleType

from cadquery import exporters

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES_DIR = ROOT / "example-library" / "cadquery-docs"
INDEX_PATH = EXAMPLES_DIR / "index.json"
SERVER_PATH = ROOT / "gui-bridge" / "server.py"


def _example_paths() -> list[Path]:
    return sorted(EXAMPLES_DIR.glob("*.py"))


def _load_server_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("gui_bridge_server", SERVER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load gui bridge module from {SERVER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _best_effort_unlink(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


class ExampleLibraryValidationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.example_paths = _example_paths()
        cls.index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        cls.server = _load_server_module()

    def _execute_example(self, path: Path):
        shown = []

        def show_object(obj, *args, **kwargs):
            shown.append(obj)
            return obj

        globals_dict = {"__name__": "__main__", "show_object": show_object}
        code = path.read_text(encoding="utf-8")
        exec(compile(code, str(path), "exec"), globals_dict)
        result = globals_dict.get("result")
        self.assertIsNotNone(result, f"{path.name} did not set result")
        self.assertTrue(shown, f"{path.name} did not call show_object")
        return result

    def _export_to_stl(self, result, example_name: str) -> None:
        fd, tmp_name = tempfile.mkstemp(prefix="cq-example-", suffix=".stl")
        os.close(fd)
        out_path = Path(tmp_name)
        try:
            exporters.export(
                result,
                str(out_path),
                exportType="STL",
                tolerance=0.05,
                angularTolerance=0.1,
            )
            self.assertTrue(out_path.exists(), f"{example_name} did not export STL")
            self.assertGreater(
                out_path.stat().st_size, 0, f"{example_name} exported an empty STL"
            )
        finally:
            _best_effort_unlink(out_path)

    def test_index_matches_example_files(self) -> None:
        indexed_files = [entry["file"] for entry in self.index["examples"]]
        actual_files = [path.name for path in self.example_paths]
        self.assertEqual(self.index["count"], len(self.example_paths))
        self.assertEqual(indexed_files, actual_files)

    def test_examples_execute_and_export(self) -> None:
        for path in self.example_paths:
            with self.subTest(example=path.name):
                result = self._execute_example(path)
                self._export_to_stl(result, path.name)

    def test_bridge_runs_all_examples(self) -> None:
        for path in self.example_paths:
            with self.subTest(example=path.name):
                code = path.read_text(encoding="utf-8")
                response = self.server._run_script_sync(
                    self.server.RunRequest(script=code, exportFormats=[])
                )
                self.assertTrue(
                    response["ok"],
                    f"{path.name} failed in bridge:\n{response['stderr']}",
                )

    def test_bridge_accepts_show_object_fallback(self) -> None:
        response = self.server._run_script_sync(
            self.server.RunRequest(
                script="shape = cq.Workplane('XY').box(1, 2, 3)\nshow_object(shape)\n",
                exportFormats=[],
            )
        )
        self.assertTrue(response["ok"], response["stderr"])

    def test_bridge_sanitizes_example_titles(self) -> None:
        response = self.server.list_examples()
        self.assertEqual(response["count"], len(response["examples"]))
        for example in response["examples"]:
            with self.subTest(example=example["file"]):
                self.assertNotIn("\uf0c1", example["title"])
                self.assertEqual(example["title"], example["title"].strip())


if __name__ == "__main__":
    unittest.main()
