"""Evaluation data access (Slice 7, AVP-014). An evaluation and its items are
written in ONE transaction; rows always satisfy the evaluation_items CHECKs
(status/level pairing, met/partial need evidence) because they come from the
deterministic verifier, and `_check_item` re-asserts that before Postgres does."""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass, field
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from avp_api.db import models
from avp_api.schemas.evaluation import EvidenceItem, VerifiedCriterion


@dataclass
class EvaluationRecord:
    id: str
    session_id: str
    status: str
    model: str
    prompt_version: str
    rubric_version: int
    scoring_version: str
    total_score: float | None
    critical_missed: bool
    error: str | None
    created_at: datetime.datetime
    items: list[VerifiedCriterion] = field(default_factory=list)


class EvaluationRepository(Protocol):
    def save(
        self,
        *,
        session_id: str,
        status: str,
        model: str,
        prompt_version: str,
        rubric_version: int,
        scoring_version: str,
        total_score: float | None,
        critical_missed: bool,
        error: str | None,
        items: list[VerifiedCriterion],
    ) -> EvaluationRecord: ...

    def latest_for_session(self, session_id: str) -> EvaluationRecord | None: ...


_LEVEL_FOR_STATUS = {"met": 2, "partial": 1, "unmet": 0, "insufficient_evidence": None}


def check_item(v: VerifiedCriterion) -> None:
    """Code mirror of the evaluation_items CHECK constraints."""
    if v.level != _LEVEL_FOR_STATUS[v.status]:
        raise ValueError(f"status/level mismatch for {v.criterion_id}")
    if v.status in ("met", "partial") and not v.evidence:
        raise ValueError(f"{v.status} without evidence for {v.criterion_id}")


class SqlEvaluationRepository:
    def __init__(self, db: OrmSession) -> None:
        self.db = db

    def save(self, *, items: list[VerifiedCriterion], **kw) -> EvaluationRecord:
        for v in items:
            check_item(v)
        row = models.Evaluation(session_id=uuid.UUID(kw.pop("session_id")), **kw)
        try:
            self.db.add(row)
            self.db.flush()  # assigns row.id inside the same transaction
            for v in items:
                self.db.add(
                    models.EvaluationItem(
                        evaluation_id=row.id,
                        criterion_id=v.criterion_id,
                        level=v.level,
                        status=v.status,
                        evidence=[e.model_dump() for e in v.evidence],
                        feedback=v.feedback or None,
                        flagged=v.flagged,
                    )
                )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        self.db.refresh(row)
        return _to_record(row, items)

    def latest_for_session(self, session_id: str) -> EvaluationRecord | None:
        try:
            sid = uuid.UUID(session_id)
        except ValueError:
            return None
        row = self.db.execute(
            select(models.Evaluation)
            .where(models.Evaluation.session_id == sid)
            .order_by(models.Evaluation.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if row is None:
            return None
        rows = self.db.execute(
            select(models.EvaluationItem)
            .where(models.EvaluationItem.evaluation_id == row.id)
            .order_by(models.EvaluationItem.id)
        ).scalars()
        items = [
            VerifiedCriterion(
                criterion_id=i.criterion_id,
                level=i.level,
                status=i.status,
                evidence=[EvidenceItem(**e) for e in (i.evidence or [])],
                feedback=i.feedback or "",
                flagged=i.flagged,
            )
            for i in rows
        ]
        return _to_record(row, items)


def _to_record(row: models.Evaluation, items: list[VerifiedCriterion]) -> EvaluationRecord:
    return EvaluationRecord(
        id=str(row.id),
        session_id=str(row.session_id),
        status=row.status,
        model=row.model,
        prompt_version=row.prompt_version,
        rubric_version=row.rubric_version,
        scoring_version=row.scoring_version,
        total_score=float(row.total_score) if row.total_score is not None else None,
        critical_missed=row.critical_missed,
        error=row.error,
        created_at=row.created_at,
        items=list(items),
    )
