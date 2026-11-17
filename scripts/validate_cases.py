#!/usr/bin/env python
"""Validate clinical case JSON files (AVP-035).

Checks, per case file:
  errors (exit 1):
    - conforms to schemas/case.schema.json (JSON Schema 2020-12)
    - ids are unique within the case (h-*, e-*, l-*, r-*)
    - no `polarity: unknown` history entry is phrased as a negative
      (unknown must neither confirm nor deny; see docs/specs/guardrails.md)
    - if `catalog` exists: display_complaint equals presentation.chief_complaint
      verbatim, and no card text contains diagnosis.primary or title.vi
  warnings (exit 0):
    - rubric does not cover all seven domains
    - author_added entries still unreviewed while review.status != clinician_reviewed

Usage:
    python scripts/validate_cases.py [case.json ...]
With no arguments, validates every data/cases/*.json (skipping files
whose name starts with "_", which are illustrative examples... still checked,
but see below). Exit code 0 only if every file is valid.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = REPO_ROOT / "schemas" / "case.schema.json"
CASES_DIR = REPO_ROOT / "data" / "cases"

RUBRIC_DOMAINS = {
    "history",
    "epidemiology",
    "physical_exam",
    "investigations",
    "diagnosis",
    "management",
    "communication",
}
# Phrases that turn an "unknown" into an invented negative (forbidden).
NEGATIVE_MARKERS = ("không có", "không bị", "chưa bao giờ")


def _load_validator() -> Draft202012Validator:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


def _catalog_errors(case: dict) -> list[str]:
    """Check the optional `catalog` block (Slice 20): verbatim complaint, no diagnosis leak."""
    catalog = case.get("catalog")
    if not isinstance(catalog, dict):
        return []
    errors: list[str] = []
    complaint = catalog.get("display_complaint")
    chief = case.get("presentation", {}).get("chief_complaint")
    if complaint != chief:
        errors.append("catalog: display_complaint must equal presentation.chief_complaint verbatim")

    regions = catalog.get("exam_regions", [])
    texts = [complaint] + [r.get("label") for r in regions if isinstance(r, dict)]
    texts = [t.casefold() for t in texts if isinstance(t, str)]
    names = (case.get("diagnosis", {}).get("primary"), case.get("title", {}).get("vi"))
    for name in {n.strip().casefold() for n in names if isinstance(n, str) and n.strip()}:
        if any(name in t for t in texts):
            errors.append("catalog: card text must not contain the diagnosis or case title")
            break
    return errors


def validate_case(path: Path, validator: Draft202012Validator | None = None) -> tuple[list[str], list[str]]:
    """Return (errors, warnings) for one case file."""
    validator = validator or _load_validator()
    errors: list[str] = []
    warnings: list[str] = []

    try:
        case = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"invalid JSON: {exc}"], []

    # 1) JSON Schema
    for err in sorted(validator.iter_errors(case), key=lambda e: list(e.path)):
        loc = "/".join(str(p) for p in err.path) or "(root)"
        errors.append(f"schema: {loc}: {err.message}")

    # 2) unique ids across history/exam/labs/rubric
    ids: list[str] = []
    for key in ("history", "exam", "labs"):
        ids += [item.get("id", "") for item in case.get(key, []) if isinstance(item, dict)]
    ids += [item.get("id", "") for item in case.get("rubric", {}).get("items", []) if isinstance(item, dict)]
    seen: set[str] = set()
    for i in ids:
        if i and i in seen:
            errors.append(f"duplicate id: {i}")
        seen.add(i)

    # 3) unknown must not be phrased as a negative
    for h in case.get("history", []):
        if isinstance(h, dict) and h.get("polarity") == "unknown":
            lay = (h.get("lay_response") or "").lower()
            if any(marker in lay for marker in NEGATIVE_MARKERS):
                errors.append(
                    f"unknown turned into a negative: {h.get('id')} "
                    f"(polarity=unknown but lay_response asserts a negative)"
                )

    # 3b) catalog card must quote the complaint verbatim and never name the diagnosis
    errors += _catalog_errors(case)

    # 4) warnings: rubric domain coverage
    covered = {it.get("domain") for it in case.get("rubric", {}).get("items", [])}
    missing = RUBRIC_DOMAINS - covered
    if missing:
        warnings.append(f"rubric does not cover domains: {', '.join(sorted(missing))}")

    # 5) warnings: unreviewed author_added entries
    if case.get("review", {}).get("status") != "clinician_reviewed":
        author_added = []
        for key in ("history", "exam", "labs"):
            author_added += [
                it.get("id") for it in case.get(key, []) if isinstance(it, dict) and it.get("origin") == "author_added"
            ]
        author_added += [
            it.get("id")
            for it in case.get("rubric", {}).get("items", [])
            if it.get("origin") == "author_added"
        ]
        if author_added:
            warnings.append(f"author_added entries awaiting clinician review: {', '.join(author_added)}")

    return errors, warnings


def _targets(argv: list[str]) -> list[Path]:
    if argv:
        return [Path(a) for a in argv]
    return sorted(CASES_DIR.glob("*.json"))


def main(argv: list[str]) -> int:
    targets = _targets(argv)
    if not targets:
        print("no case files found")
        return 1
    validator = _load_validator()
    ok = True
    for path in targets:
        errors, warnings = validate_case(path, validator)
        for w in warnings:
            print(f"WARN  {path.name}: {w}")
        if errors:
            ok = False
            for e in errors:
                print(f"ERROR {path.name}: {e}")
            print(f"INVALID {path.name}")
        else:
            print(f"VALID {path.name}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
