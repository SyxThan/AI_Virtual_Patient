"""evals/publish_summary.py (AVP-139): only real, latest, audited results reach the web page."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "evals"))
_spec = importlib.util.spec_from_file_location(
    "avp_eval_publish", REPO_ROOT / "evals" / "publish_summary.py"
)
pub = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = pub
_spec.loader.exec_module(pub)


def _summ(p50: int) -> dict:
    return {"n": 3, "min": p50, "p50": p50, "p95": p50 + 1, "max": p50 + 1, "mean": p50}


def _latency(fake: bool, measured_at: str, p50: int) -> dict:
    return {
        "measured_at": measured_at,
        "git_commit": "abc1234",
        "contains_fake_provider": fake,
        "config": {"provider_names": {"llm": "m", "stt": "whisper", "tts": "vieneu"}, "setup": "s"},
        "turns_total": 3,
        "turns_with_errors": 0,
        "summary_ms": {
            k: _summ(p50) for k in ("stt_ms", "llm_ms", "tts_ms", "first_text_ms", "first_audio_ms")
        },
        "target": {"target_ms": 1500, "met": None if fake else p50 + 1 < 1500},
    }


def _write(d: Path, name: str, data: dict) -> None:
    (d / name).write_text(json.dumps(data), encoding="utf-8")


def test_nothing_real_means_all_null(tmp_path: Path) -> None:
    _write(tmp_path, "latency-voice-1.json", _latency(True, "2026-11-16T01:00:00+00:00", 5))
    s = pub.build(tmp_path)
    assert s["latency"] == {"voice": None, "text": None}
    assert s["repeatability"] is None and s["redteam"] is None and s["judge"] is None


def test_fake_and_unknown_provenance_are_never_published(tmp_path: Path) -> None:
    unknown = _latency(False, "2026-11-16T03:00:00+00:00", 9)
    del unknown["contains_fake_provider"]
    _write(tmp_path, "latency-voice-a.json", unknown)
    _write(tmp_path, "latency-voice-b.json", _latency(True, "2026-11-16T04:00:00+00:00", 1))
    _write(tmp_path, "latency-voice-c.json", _latency(False, "2026-11-16T02:00:00+00:00", 900))
    (tmp_path / "latency-voice-d.json").write_text("{broken", encoding="utf-8")
    v = pub.build(tmp_path)["latency"]["voice"]
    assert v["first_audio_p50"] == 900 and v["source"] == "evals/results/latency-voice-c.json"


def test_latest_real_result_wins(tmp_path: Path) -> None:
    _write(tmp_path, "latency-voice-a.json", _latency(False, "2026-11-16T01:00:00+00:00", 1400))
    _write(tmp_path, "latency-voice-b.json", _latency(False, "2026-11-16T05:00:00+00:00", 1100))
    v = pub.build(tmp_path)["latency"]["voice"]
    assert v["first_audio_p50"] == 1100 and v["target_met"] is True
    assert v["measured_at"] == "2026-11-16T05:00:00+00:00" and v["git_commit"] == "abc1234"


def _judged() -> dict:
    return {
        "measured_at": "2026-11-16T06:00:00+00:00",
        "git_commit": "abc1234",
        "contains_fake_provider": False,
        "config": {"patient_model": "p", "judge_model": "j"},
        "summary": {"judged": 80, "unsupported_per_100": 2.5, "gated_leaks_per_100": 1.3},
    }


def _score(complete: bool) -> dict:
    return {
        "config": {"audit_csv": "redteam-audit-20261116T060000Z.csv"},
        "summary": {
            "complete": complete,
            "human_labelled": 50 if complete else 20,
            "label_agreement": 0.96,
            "judge_missed_unsupported": 1,
        },
    }


def test_judge_needs_a_complete_human_audit(tmp_path: Path) -> None:
    _write(tmp_path, "redteam-judged-20261116T060000Z.json", _judged())
    assert pub.build(tmp_path)["judge"] is None  # no audit yet

    _write(tmp_path, "redteam-audit-score-x.json", _score(complete=False))
    assert pub.build(tmp_path)["judge"] is None  # audit incomplete

    _write(tmp_path, "redteam-audit-score-y.json", _score(complete=True))
    j = pub.build(tmp_path)["judge"]
    assert j["unsupported_per_100"] == 2.5 and j["audit_labelled"] == 50
    assert j["audit_agreement"] == 0.96 and j["judge_model"] == "j"


def _redteam(case_id: str, measured_at: str, passed: int, fake: bool = False) -> dict:
    return {
        "measured_at": measured_at,
        "git_commit": "abc1234",
        "contains_fake_provider": fake,
        "config": {"patient_model": "m", "case_id": case_id},
        "summary": {"prompts": 10, "completed": 10, "passed": passed, "pass_rate": passed / 10},
        "by_category": {"dialect": {"n": 10, "errors": 0, "passed": passed}},
    }


def test_redteam_sums_the_latest_real_run_of_each_case(tmp_path: Path) -> None:
    _write(tmp_path, "redteam-case-a-1.json", _redteam("case-a", "2026-11-16T01:00:00+00:00", 2))
    _write(tmp_path, "redteam-case-a-2.json", _redteam("case-a", "2026-11-16T05:00:00+00:00", 9))
    _write(tmp_path, "redteam-case-b-1.json", _redteam("case-b", "2026-11-16T03:00:00+00:00", 7))
    _write(
        tmp_path,
        "redteam-case-c-1.json",
        _redteam("case-c", "2026-11-16T09:00:00+00:00", 0, fake=True),
    )
    r = pub.build(tmp_path)["redteam"]
    assert [c["case_id"] for c in r["cases"]] == ["case-a", "case-b"]  # fake run never counts
    assert r["completed"] == 20 and r["passed"] == 16 and r["pass_rate"] == 0.8
    assert r["by_category"] == {"dialect": {"n": 20, "passed": 16}}
    assert r["measured_at"] == "2026-11-16T05:00:00+00:00"
    assert r["first_measured_at"] == "2026-11-16T03:00:00+00:00"
    assert r["cases"][0]["title"] == "case-a"  # no case file: falls back to the id
    assert r["errors"] == 0 and r["cases"][1]["errors"] == 0


def test_redteam_reports_prompts_without_a_reply(tmp_path: Path) -> None:
    run = _redteam("case-a", "2026-11-16T01:00:00+00:00", 7)
    run["summary"].update(completed=8, passed=7)  # 2 of 10 prompts errored
    _write(tmp_path, "redteam-case-a-1.json", run)
    r = pub.build(tmp_path)["redteam"]
    assert r["errors"] == 2 and r["cases"][0]["errors"] == 2 and r["completed"] == 8


def test_real_eval_outputs_round_trip(tmp_path: Path, monkeypatch) -> None:
    """Feed the real scripts' output (relabelled as real) through publish."""
    for name in ("latency", "repeatability", "redteam"):
        spec = importlib.util.spec_from_file_location(
            f"pub_{name}", REPO_ROOT / "evals" / f"{name}.py"
        )
        mod = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = mod
        spec.loader.exec_module(mod)
        monkeypatch.chdir(tmp_path)
        args = {"latency": ["--sessions", "1"], "repeatability": ["--runs", "2"], "redteam": []}
        out = mod.main(args[name], out_dir=tmp_path)
        path = out[0] if isinstance(out, tuple) else out
        data = json.loads(path.read_text(encoding="utf-8"))
        data["contains_fake_provider"] = False  # simulate a real run's flag only
        path.write_text(json.dumps(data), encoding="utf-8")

    out_file = tmp_path / "summary.json"
    pub.main(["--results", str(tmp_path), "--out", str(out_file)])
    s = json.loads(out_file.read_text(encoding="utf-8"))
    assert s["latency"]["text"]["turns"] == 7
    assert s["repeatability"]["criterion_cells"] == 24
    assert s["redteam"]["prompts"] == 80 and len(s["redteam"]["by_category"]) == 8
