"""Turn (transcript) data access (ADR-0007)."""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from avp_api.db import models


@dataclass
class TurnRecord:
    id: int
    session_id: str
    idx: int
    speaker: str
    text: str
    t_start_ms: int
    created_at: datetime.datetime


class TurnRepository(Protocol):
    def next_idx(self, session_id: str) -> int: ...

    def add(
        self,
        *,
        session_id: str,
        idx: int,
        speaker: str,
        text: str,
        t_start_ms: int,
        guardrail: dict | None,
    ) -> TurnRecord: ...

    def list_for_session(self, session_id: str) -> list[TurnRecord]: ...


def _to_record(row: models.Turn) -> TurnRecord:
    return TurnRecord(
        id=row.id,
        session_id=str(row.session_id),
        idx=row.idx,
        speaker=row.speaker,
        text=row.text,
        t_start_ms=row.t_start_ms,
        created_at=row.created_at,
    )


class SqlTurnRepository:
    def __init__(self, db: OrmSession) -> None:
        self.db = db

    def next_idx(self, session_id: str) -> int:
        stmt = select(func.coalesce(func.max(models.Turn.idx), -1)).where(
            models.Turn.session_id == uuid.UUID(session_id)
        )
        return int(self.db.execute(stmt).scalar_one()) + 1

    def add(self, **kwargs) -> TurnRecord:
        row = models.Turn(session_id=uuid.UUID(kwargs.pop("session_id")), **kwargs)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return _to_record(row)

    def list_for_session(self, session_id: str) -> list[TurnRecord]:
        stmt = (
            select(models.Turn)
            .where(models.Turn.session_id == uuid.UUID(session_id))
            .order_by(models.Turn.idx)
        )
        return [_to_record(r) for r in self.db.execute(stmt).scalars().all()]
