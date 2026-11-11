"""Deterministic OSCE scoring (Slice 7, AVP-013). Pure function: the same rubric
and verified items always give the same total (docs/specs/evaluation.md).

Whether a missed critical criterion also caps the total is a clinician decision
(AVP-016); until then it only raises `critical_missed`. TODO(clinician).
"""

from __future__ import annotations

from avp_api.schemas.evaluation import ScoringResult, VerifiedCriterion

SCORING_VERSION = "1.0.0"


def item_score(level: int | None) -> float:
    return level / 2.0 if level in (0, 1, 2) else 0.0


def compute_osce_score(
    rubric_items: list[dict], verified_items: list[VerifiedCriterion]
) -> ScoringResult:
    by_id = {v.criterion_id: v for v in verified_items}
    weighted = 0.0
    total_weight = 0.0
    critical_missed = False
    for crit in rubric_items:
        weight = float(crit.get("weight", 1))
        v = by_id.get(crit["id"])
        level = v.level if v is not None else None
        status = v.status if v is not None else "insufficient_evidence"
        weighted += weight * item_score(level)
        total_weight += weight
        if crit.get("critical") and status in ("unmet", "insufficient_evidence"):
            critical_missed = True
    total = round(weighted / total_weight * 100, 2) if total_weight > 0 else 0.0
    return ScoringResult(
        total_score=total, critical_missed=critical_missed, scoring_version=SCORING_VERSION
    )
