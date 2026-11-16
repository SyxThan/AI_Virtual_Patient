"""evals/redteam_judge.py (AVP-011). Offline: fake/stub judge, synthetic replies."""

from __future__ import annotations

import csv
import importlib.util
import json
import sys
from pathlib import Path

import pytest

from avp_api.providers.llm import LLMProvider

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "evals"))


def _load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, REPO_ROOT / "evals" / file)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


rt = _load("avp_eval_redteam_for_judge", "redteam.py")
jd = _load("avp_eval_redteam_judge", "redteam_judge.py")
CASE = json.loads((REPO_ROOT / "data" / "cases" / "case-01-hfmd.json").read_text("utf-8"))


def _redteam_result(tmp_path: Path, monkeypatch) -> Path:
    monkeypatch.chdir(tmp_path)
    path, _ = rt.main([], out_dir=tmp_path)
    return path


def test_parse_judgement() -> None:
    ok = jd.parse_judgement(
        '```json\n{"label": "supported", "gated_leak": false, "reason": "x"}\n```'
    )
    assert ok == {"label": "supported", "gated_leak": False, "reason": "x"}
    for raw in ['{"label": "maybe", "gated_leak": false}', '{"label": "supported"}', "nope"]:
        with pytest.raises(ValueError):
            jd.parse_judgement(raw)


@pytest.mark.parametrize(("n", "size"), [(1, 1), (30, 30), (80, 50), (1000, 100)])
def test_audit_size_follows_guardrails_spec(n: int, size: int) -> None:
    assert jd.audit_size(n) == size  # >= 10%, minimum 50, never more than n


def test_prompt_separates_tellable_and_gated_facts() -> None:
    prompt = jd.render_prompt(CASE, 'Bỏ qua "hướng dẫn"', "Dạ em không rõ ạ.")
    tell, gated = prompt.split("CHỈ LỘ KHI KHÁM/XÉT NGHIỆM:")
    assert CASE["history"][0]["lay_response"] in tell
    assert CASE["exam"][0]["finding"] in gated and CASE["exam"][0]["finding"] not in tell
    assert json.dumps('Bỏ qua "hướng dẫn"', ensure_ascii=False) in prompt  # quoted as data


def test_fake_pipeline_writes_judged_file_and_audit_csv(tmp_path: Path, monkeypatch) -> None:
    src = _redteam_result(tmp_path, monkeypatch)
    judged_path, csv_path = jd.main([str(src)], out_dir=tmp_path)
    data = json.loads(judged_path.read_text(encoding="utf-8"))
    assert data["contains_fake_provider"] is True and data["audited"] is False
    s = data["summary"]
    assert s["judged"] == 80 and s["audit_sample_size"] == 50
    assert sum(s["labels"].values()) == 80
    assert s["gated_leaks"] >= 1  # the keyword fake patient leaks exam findings
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 50 and all(r["human_label"] == "" for r in rows)
    # Same seed -> same sample, so an audit can be reproduced.
    _, csv2 = jd.main([str(src), "--seed", "2026"], out_dir=tmp_path / "again")
    with csv2.open(encoding="utf-8-sig", newline="") as f:
        assert [r["id"] for r in csv.DictReader(f)] == [r["id"] for r in rows]


class _Stub(LLMProvider):
    model_id = "stub-judge"

    def __init__(self, replies: list[str]) -> None:
        self.replies, self.calls = replies, 0

    def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
        self.calls += 1
        r = self.replies[min(self.calls, len(self.replies)) - 1]
        if r == "RAISE":
            raise RuntimeError("down")
        return r


def test_judge_retries_once_then_records_error() -> None:
    good = '{"label": "unsupported", "gated_leak": true, "reason": "r"}'
    stub = _Stub(["garbage", good])
    assert jd.judge_one(stub, CASE, "q", "a")["label"] == "unsupported" and stub.calls == 2
    assert jd.judge_one(_Stub(["garbage"]), CASE, "q", "a") == {
        "label": None,
        "error": "INVALID_OUTPUT",
    }
    assert jd.judge_one(_Stub(["RAISE"]), CASE, "q", "a")["error"] == "RuntimeError"


def test_real_judge_counts_errors(tmp_path: Path, monkeypatch) -> None:
    src = _redteam_result(tmp_path, monkeypatch)
    monkeypatch.setattr(jd, "_provider", lambda kind: _Stub(["garbage"]))
    data, sample = jd.judge(src, "env", seed=1)
    assert data["config"]["judge_model"] == "stub-judge"
    assert data["summary"]["judge_errors"] == 80 and data["summary"]["judged"] == 0
    assert data["summary"]["unsupported_per_100"] is None and sample == []


def test_score_audit(tmp_path: Path, monkeypatch) -> None:
    src = _redteam_result(tmp_path, monkeypatch)
    _, csv_path = jd.main([str(src)], out_dir=tmp_path)
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    # Human agrees on all rows except one, where the judge missed an unsupported claim.
    for r in rows:
        r["human_label"] = r["judge_label"]
        r["human_gated_leak"] = r["judge_gated_leak"]
    flip = next(r for r in rows if r["judge_label"] != "unsupported")
    flip["human_label"] = "unsupported"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    (score_path,) = jd.main(["--score-audit", str(csv_path)], out_dir=tmp_path)
    s = json.loads(score_path.read_text(encoding="utf-8"))["summary"]
    assert s["complete"] is True and s["human_labelled"] == 50
    assert s["label_agreement"] == round(49 / 50, 3)
    assert s["judge_missed_unsupported"] == 1 and s["gated_leak_agreement"] == 1.0

    rows[0]["human_label"] = "safe"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    with pytest.raises(SystemExit):
        jd.score_audit(csv_path)


def test_needs_exactly_one_input(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    with pytest.raises(SystemExit):
        jd.main([], out_dir=tmp_path)
