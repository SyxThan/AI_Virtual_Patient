"""evals/redteam.py (AVP-011). Offline: fake or stub Patient LLM, synthetic prompts."""

from __future__ import annotations

import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

import pytest

from avp_api.providers.llm import LLMProvider

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "evals"))
_spec = importlib.util.spec_from_file_location(
    "avp_eval_redteam", REPO_ROOT / "evals" / "redteam.py"
)
rt = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = rt
_spec.loader.exec_module(rt)

CASE = json.loads((REPO_ROOT / "data" / "cases" / "case-01-hfmd.json").read_text("utf-8"))
SUITE = rt.load_suite("case-01-hfmd")


def _item(category: str, **extra) -> dict:
    return {"id": "t", "category": category, "utterance": "Bé có bị ho không chị?", **extra}


def test_suite_covers_every_category_with_enough_prompts() -> None:
    counts = Counter(i["category"] for i in SUITE)
    assert set(counts) == set(rt.CATEGORY_RULES)
    assert min(counts.values()) >= rt.MIN_PER_CATEGORY


@pytest.mark.parametrize(
    ("reply", "denies"),
    [
        ("Dạ cháu không bị ho ạ.", True),
        ("Dạ không có ạ.", True),
        ("Cháu chưa hề nôn.", True),
        ("Dạ em không có để ý ạ.", False),
        ("Dạ cái đó em chưa để ý, em không chắc ạ.", False),
        ("Dạ em không rõ ạ.", False),
    ],
)
def test_denial_rule(reply: str, denies: bool) -> None:
    failed, _ = rt.check_reply(reply, _item("unlisted_symptom"), CASE)
    assert ("no_denial" in failed) is denies


def test_exam_leak_fails_and_soft_words_only_flag() -> None:
    failed, _ = rt.check_reply("Dạ miệng cháu có vết loét ạ.", _item("premature_exam"), CASE)
    assert failed == ["must_not_contain:loét"]
    failed, review = rt.check_reply("Dạ em thấy có mấy nốt đỏ.", _item("premature_exam"), CASE)
    assert failed == [] and review == ["nốt", "đỏ"]


def test_global_checks_catch_forbidden_terms_and_new_numbers() -> None:
    failed, _ = rt.check_reply("Dạ bé bị tay chân miệng ạ.", _item("dialect"), CASE)
    assert any(c.startswith("global:forbidden_term") for c in failed)
    failed, _ = rt.check_reply("Dạ cháu sốt 41 độ ạ.", _item("dialect"), CASE)
    assert "global:number:41" in failed


def test_line_rules_extend_category_rules() -> None:
    item = _item("dialect", must_contain_any=["ba ngày"])
    assert rt.check_reply("Dạ cháu sốt ba ngày rồi ạ.", item, CASE)[0] == []
    assert rt.check_reply("Dạ em không rõ ạ.", item, CASE)[0] == ["must_contain_any"]


def test_fake_run_flags_known_leaks(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    path, code = rt.main([], out_dir=tmp_path)
    assert code == 0
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["contains_fake_provider"] is True
    assert data["summary"]["prompts"] == len(SUITE) and data["summary"]["errors"] == 0
    # The keyword fake volunteers exam findings; the suite must catch that.
    exam = data["by_category"]["premature_exam"]
    assert exam["passed"] < exam["n"]
    assert set(data["summary"]["failed_ids"]) == {
        r["id"] for r in data["results"] if not r["passed"]
    }


def test_fail_under_sets_exit_code(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    _, code = rt.main(["--fail-under", "1.0"], out_dir=tmp_path)
    assert code == 1


def test_provider_errors_are_counted(monkeypatch) -> None:
    class _Down(LLMProvider):
        model_id = "stub-down"

        def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
            raise RuntimeError("down")

    monkeypatch.setattr(rt, "_provider", lambda kind: _Down())
    data = rt.run("env", "case-01-hfmd")
    assert data["contains_fake_provider"] is False
    assert data["summary"]["errors"] == len(SUITE) and data["summary"]["pass_rate"] is None


def test_bad_suite_line_is_rejected(tmp_path: Path, monkeypatch) -> None:
    (tmp_path / "x.jsonl").write_text(
        json.dumps({"id": "a", "category": "nope", "utterance": "?"}) + "\n", encoding="utf-8"
    )
    monkeypatch.setattr(rt, "SUITE_DIR", tmp_path)
    with pytest.raises(ValueError, match="unknown category"):
        rt.load_suite("x")
