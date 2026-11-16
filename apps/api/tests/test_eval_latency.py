"""evals/latency.py and evals/common.py (AVP-026). Fake providers only, no network."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "evals"))
_spec = importlib.util.spec_from_file_location(
    "avp_eval_latency", REPO_ROOT / "evals" / "latency.py"
)
latency = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = latency  # dataclasses resolve their module via sys.modules
_spec.loader.exec_module(latency)
common = latency.common


def test_percentile_nearest_rank() -> None:
    values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6]
    assert common.percentile(values, 50) == 5
    assert common.percentile(values, 95) == 10
    assert common.percentile(values, 100) == 10
    assert common.percentile([42], 95) == 42
    assert common.percentile([], 50) is None
    with pytest.raises(ValueError):
        common.percentile(values, 0)


def test_summarize_empty_and_values() -> None:
    assert common.summarize([])["n"] == 0
    s = common.summarize([100, 200, 300])
    assert s == {"n": 3, "min": 100, "p50": 200, "p95": 300, "max": 300, "mean": 200.0}


@pytest.mark.parametrize("mode", ["text", "voice"])
def test_fake_run_writes_honest_result(mode: str, tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)  # main() chdirs to apps/api; restored after the test
    path = latency.main(["--mode", mode, "--sessions", "2", "--warmup", "1"], out_dir=tmp_path)
    assert path.parent == tmp_path and path.name.startswith(f"latency-{mode}-")
    data = json.loads(path.read_text(encoding="utf-8"))

    n_turns = 2 * len(latency.QUESTIONS) - 1
    assert data["turns_total"] == n_turns == len(data["turns"])
    assert data["turns_with_errors"] == 0
    assert data["config"]["case_id"] == "case-01-hfmd"
    # Fake providers are flagged and never claim the target.
    assert data["contains_fake_provider"] is True
    assert data["target"]["met"] is None and data["target"]["target_ms"] == 1500
    fa = data["summary_ms"]["first_audio_ms"]
    assert fa["n"] == n_turns and 0 <= fa["p50"] <= fa["p95"] <= fa["max"]
    stt = data["summary_ms"]["stt_ms"]
    assert stt["n"] == (n_turns if mode == "voice" else 0)
    assert data["measured_at"] and data["script"] == "evals/latency.py"


def test_result_stores_numbers_not_text(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    path = latency.main(["--mode", "voice", "--sessions", "1"], out_dir=tmp_path)
    raw = path.read_text(encoding="utf-8")
    from avp_api.providers.stt import FakeSTTProvider

    for q in latency.QUESTIONS:
        assert q not in raw
    assert FakeSTTProvider.TRANSCRIPT not in raw
    assert latency.GUEST_TOKEN not in raw


def test_rejects_bad_args(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    with pytest.raises(SystemExit):
        latency.main(["--sessions", "0"], out_dir=tmp_path)
