from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parent
SERVER_PATH = ROOT / "gui-bridge" / "server.py"


def _load_server_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("gui_bridge_server", SERVER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load gui bridge module from {SERVER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Phase3CompletionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = _load_server_module()

    def test_syntax_check_reports_editor_diagnostic(self) -> None:
        response = self.server.syntax_check(
            self.server.SyntaxCheckRequest(script="def foo(\n    return 1\n")
        )

        self.assertFalse(response["ok"])
        self.assertTrue(response["diagnostics"])
        diagnostic = response["diagnostics"][0]
        self.assertEqual(diagnostic["line"], 1)
        self.assertTrue(diagnostic["message"])
        self.assertEqual(diagnostic["detail"], "def foo(")

    def test_syntax_check_returns_empty_list_for_valid_script(self) -> None:
        response = self.server.syntax_check(
            self.server.SyntaxCheckRequest(
                script="import cadquery as cq\nresult = cq.Workplane('XY').box(1, 2, 3)\n"
            )
        )

        self.assertTrue(response["ok"])
        self.assertEqual(response["diagnostics"], [])

    def test_run_request_respects_client_provided_run_id(self) -> None:
        response = self.server._run_script_sync(
            self.server.RunRequest(
                script="import cadquery as cq\nresult = cq.Workplane('XY').box(1, 2, 3)\n",
                exportFormats=[],
                runId="phase3run001",
            )
        )

        self.assertTrue(response["ok"], response["stderr"])
        self.assertEqual(response["run_id"], "phase3run001")

    def test_new_project_starter_uses_parameterized_template(self) -> None:
        with tempfile.TemporaryDirectory(dir=ROOT) as tmpdir:
            response = self.server.workspace_create_project(
                self.server.CreateProjectRequest(
                    name="Phase3Starter",
                    parentDir=tmpdir,
                )
            )

        starter_code = response["starterCode"]
        for snippet in (
            "length = 80.0",
            "width = 50.0",
            "height = 20.0",
            "fillet_radius = 3.0",
            "hole_diameter = 6.0",
            ".hole(hole_diameter)",
        ):
            with self.subTest(snippet=snippet):
                self.assertIn(snippet, starter_code)


if __name__ == "__main__":
    unittest.main()
