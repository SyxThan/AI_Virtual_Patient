"""evals/repeatability.py (AVP-117). Offline only: fake or stub evaluator, synthetic data."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

from avp_api.providers.llm import LLMProvider

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "evals"))
_spec = importlib.util.spec_from_file_location(
    "avp_eval_repeatability", REPO_ROOT / "evals" / "repeatability.py"
)
rep = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = rep
_spec.loader.exec_module(rep)

CASE = json.loads(rep.CASE_PATH.read_text(encoding="utf-8"))
FIXTURES = json.loads(rep.FIXTURES.read_text(encoding="utf-8"))
CRITERIA = [c["id"] for c in CASE["rubric"]["items"]]


def test_fixture_patient_lines_come_from_the_case() -> None:
    lay = {h["lay_response"] for h in CASE["history"]}
    fallback = {v[0] for v in CASE["fallback_lines"].values()}
    for tr in FIXTURES["transcripts"]:
        turns = rep.build_turns(tr["turns"], CASE)
        assert [t.idx for t in turns] == list(range(len(turns)))
        for t in turns:
            if t.speaker == "patient":
                assert t.text in lay | fallback  # never hand-written clinical text


def test_fake_run_is_flagged_and_stable(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    path = rep.main(["--runs", "3"], out_dir=tmp_path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["contains_fake_provider"] is True
    assert data["config"]["evaluator_models"] == ["fake-heuristic"]
    s = data["summary"]
    assert s["criterion_cells"] == len(CRITERIA) * len(FIXTURES["transcripts"])
    assert s["identical_all_runs_rate"] == 1.0 and s["max_total_score_range"] == 0
    by_id = {t["transcript_id"]: t for t in data["transcripts"]}
    assert by_id["thorough"]["total_score"]["p50"] >= by_id["minimal"]["total_score"]["p50"]


def test_output_has_no_transcript_text(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    raw = rep.main(["--runs", "2"], out_dir=tmp_path).read_text(encoding="utf-8")
    for tr in FIXTURES["transcripts"]:
        for t in rep.build_turns(tr["turns"], CASE):
            assert t.text not in raw


class _Wobbly(LLMProvider):
    """Stub LLM whose r-fever-hx proposal alternates 0 / null between calls."""

    model_id = "stub-wobbly"

    def __init__(self) -> None:
        self.calls = 0

    def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
        self.calls += 1
        items = [
            {
                "criterion_id": c,
                "level": (None if self.calls % 2 else 0) if c == "r-fever-hx" else 0,
                "evidence": [],
                "feedback": "",
            }
            for c in CRITERIA
        ]
        return json.dumps({"items": items})


def test_instability_is_measured(monkeypatch) -> None:
    monkeypatch.setattr(rep, "_provider", lambda kind: _Wobbly())
    data = rep.run("env", runs=4, only=["minimal"])
    assert data["contains_fake_provider"] is False
    assert data["config"]["evaluator_models"] == ["stub-wobbly"]
    cells = {c["criterion_id"]: c for c in data["transcripts"][0]["criteria"]}
    wobbly = cells["r-fever-hx"]
    assert wobbly["levels"] == {"null": 2, "0": 2}
    assert wobbly["modal_agreement"] == 0.5 and wobbly["identical_all_runs"] is False
    assert all(cells[c]["identical_all_runs"] for c in CRITERIA if c != "r-fever-hx")
    n = len(CRITERIA)
    assert data["summary"]["identical_all_runs_rate"] == round((n - 1) / n, 3)


def test_evaluator_errors_are_counted(monkeypatch) -> None:
    class _Broken(LLMProvider):
        model_id = "stub-broken"

        def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
            return "not json"

    monkeypatch.setattr(rep, "_provider", lambda kind: _Broken())
    data = rep.run("env", runs=2, only=["minimal"])
    t = data["transcripts"][0]
    assert t["successful_runs"] == 0 and t["error_counts"] == {"INVALID_OUTPUT": 2}
    assert data["summary"]["criterion_cells"] == 0
    assert data["summary"]["identical_all_runs_rate"] is None


def test_rejects_single_run(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    with pytest.raises(SystemExit):
        rep.main(["--runs", "1"], out_dir=tmp_path)
