"""Debrief data access (Slice 8, AVP-019). One row per debrief run in `debriefs`;
`content` (JSONB) holds the status, 5-tier summary, verified claims and the ids
of the source_chunks they cite."""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from avp_api.db import models


@dataclass
class DebriefRecord:
    id: str
    session_id: str
    evaluation_id: str
    content: dict
    created_at: datetime.datetime


class DebriefRepository(Protocol):
    def save(self, *, session_id: str, evaluation_id: str, content: dict) -> DebriefRecord: ...

    def latest_for_session(self, session_id: str) -> DebriefRecord | None: ...


def _to_record(row: models.Debrief) -> DebriefRecord:
    return DebriefRecord(
        id=str(row.id),
        session_id=str(row.session_id),
        evaluation_id=str(row.evaluation_id),
        content=dict(row.content or {}),
        created_at=row.created_at,
    )


class SqlDebriefRepository:
    def __init__(self, db: OrmSession) -> None:
        self.db = db

    def save(self, *, session_id: str, evaluation_id: str, content: dict) -> DebriefRecord:
        row = models.Debrief(
            session_id=uuid.UUID(session_id),
            evaluation_id=uuid.UUID(evaluation_id),
            content=content,
        )
        try:
            self.db.add(row)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        self.db.refresh(row)
        return _to_record(row)

    def latest_for_session(self, session_id: str) -> DebriefRecord | None:
        try:
            sid = uuid.UUID(session_id)
        except ValueError:
            return None
        row = self.db.execute(
            select(models.Debrief)
            .where(models.Debrief.session_id == sid)
            .order_by(models.Debrief.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        return _to_record(row) if row is not None else None
