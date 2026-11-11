"""Scoring engine tests: weights, determinism, critical red flags."""

from __future__ import annotations

import json
from pathlib import Path

from avp_api.schemas.evaluation import EvidenceItem, VerifiedCriterion
from avp_api.services.scoring_engine import SCORING_VERSION, compute_osce_score

CASE = json.loads(
    (Path(__file__).resolve().parents[3] / "data/cases/case-01-hfmd.json").read_text("utf-8")
)
RUBRIC = CASE["rubric"]["items"]
EV = [EvidenceItem(turn_idx=0, quote="x")]


def _v(cid: str, level: int | None) -> VerifiedCriterion:
    status = {2: "met", 1: "partial", 0: "unmet", None: "insufficient_evidence"}[level]
    return VerifiedCriterion(
        criterion_id=cid,
        level=level,
        status=status,
        evidence=EV if level in (1, 2) else [],
        feedback="",
        flagged=False,
    )


def test_weighted_total():
    rubric = [
        {"id": "a", "weight": 1, "critical": False},
        {"id": "b", "weight": 3, "critical": False},
    ]
    r = compute_osce_score(rubric, [_v("a", 2), _v("b", 1)])
    # (1*1 + 3*0.5) / 4 * 100 = 62.5
    assert r.total_score == 62.5
    assert r.scoring_version == SCORING_VERSION == "1.0.0"
    assert compute_osce_score(rubric, [_v("a", 2), _v("b", None)]).total_score == 25.0


def test_all_met_on_real_rubric_is_100_without_red_flag():
    r = compute_osce_score(RUBRIC, [_v(i["id"], 2) for i in RUBRIC])
    assert r.total_score == 100.0 and r.critical_missed is False


def test_rescoring_is_exactly_reproducible():
    items = [_v(i["id"], lvl) for i, lvl in zip(RUBRIC, [2, 1, 0, None, 2, 1, 0, 2], strict=True)]
    results = {compute_osce_score(RUBRIC, items).model_dump_json() for _ in range(5)}
    assert len(results) == 1


def test_critical_missed_for_startle_or_dx_grade():
    for missed in ("r-startle-hx", "r-dx-grade"):
        for level in (0, None):
            items = [_v(i["id"], level if i["id"] == missed else 2) for i in RUBRIC]
            assert compute_osce_score(RUBRIC, items).critical_missed is True
    # Partial on a critical item is not "missed".
    items = [_v(i["id"], 1 if i["critical"] else 2) for i in RUBRIC]
    assert compute_osce_score(RUBRIC, items).critical_missed is False


def test_criterion_absent_from_results_counts_zero_and_flags_critical():
    r = compute_osce_score(RUBRIC, [])
    assert r.total_score == 0.0 and r.critical_missed is True
