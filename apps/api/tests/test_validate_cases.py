"""Tests for scripts/validate_cases.py (AVP-035).

Valid sample must pass with no errors; a deliberately broken fixture must fail.
"""

from __future__ import annotations

import importlib.util
import json
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


HFMD = REPO_ROOT / "data" / "cases" / "case-01-hfmd.json"


def _hfmd_with_catalog(tmp_path: Path, **overrides: object) -> Path:
    case = json.loads(HFMD.read_text(encoding="utf-8"))
    case["catalog"].update(overrides)
    out = tmp_path / "case.json"
    out.write_text(json.dumps(case, ensure_ascii=False), encoding="utf-8")
    return out


def test_hfmd_catalog_is_valid() -> None:
    vc = _load_module()
    errors, _warnings = vc.validate_case(HFMD)
    assert errors == [], errors


def test_catalog_complaint_must_be_verbatim(tmp_path: Path) -> None:
    vc = _load_module()
    errors, _ = vc.validate_case(_hfmd_with_catalog(tmp_path, display_complaint="Bé sốt cao."))
    assert any("verbatim" in e for e in errors), errors


def test_catalog_must_not_name_diagnosis(tmp_path: Path) -> None:
    vc = _load_module()
    case = json.loads(HFMD.read_text(encoding="utf-8"))
    diagnosis = case["diagnosis"]["primary"].lower()
    leaked = case["presentation"]["chief_complaint"] + " Nghi " + diagnosis
    case["presentation"]["chief_complaint"] = leaked
    case["catalog"]["display_complaint"] = leaked
    path = tmp_path / "case.json"
    path.write_text(json.dumps(case, ensure_ascii=False), encoding="utf-8")
    errors, _ = vc.validate_case(path)
    assert any("diagnosis" in e for e in errors), errors


def test_catalog_schema_rejects_unknown_group(tmp_path: Path) -> None:
    vc = _load_module()
    errors, _ = vc.validate_case(_hfmd_with_catalog(tmp_path, patient_group="teen"))
    assert any(e.startswith("schema: catalog") for e in errors), errors


def test_case_without_catalog_still_valid(tmp_path: Path) -> None:
    vc = _load_module()
    case = json.loads(HFMD.read_text(encoding="utf-8"))
    del case["catalog"]
    path = tmp_path / "case.json"
    path.write_text(json.dumps(case, ensure_ascii=False), encoding="utf-8")
    errors, _ = vc.validate_case(path)
    assert errors == [], errors
