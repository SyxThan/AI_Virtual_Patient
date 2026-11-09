"""Tests for scripts/validate_cases.py (AVP-035).

Valid sample must pass with no errors; a deliberately broken fixture must fail.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "scripts" / "validate_cases.py"
EXAMPLE = REPO_ROOT / "data" / "cases" / "_example_hfmd.draft.json"
BROKEN = REPO_ROOT / "scripts" / "fixtures" / "broken_case.json"


def _load_module():
    spec = importlib.util.spec_from_file_location("validate_cases", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_valid_example_has_no_errors() -> None:
    vc = _load_module()
    errors, _warnings = vc.validate_case(EXAMPLE)
    assert errors == [], f"expected the example case to be valid, got: {errors}"


def test_broken_fixture_reports_errors() -> None:
    vc = _load_module()
    errors, _warnings = vc.validate_case(BROKEN)
    assert errors, "expected the broken fixture to produce validation errors"


def test_cli_exit_codes() -> None:
    vc = _load_module()
    assert vc.main([str(EXAMPLE)]) == 0
    assert vc.main([str(BROKEN)]) == 1
