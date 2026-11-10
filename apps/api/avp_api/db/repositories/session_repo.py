"""Session data access (the only place sessions SQL lives, ADR-0007).

A Protocol so services depend on an interface; tests use an in-memory fake.
"""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from avp_api.db import models


@dataclass
class SessionRecord:
    id: str
    case_id: str
    case_version: int
    mode: str
    status: str
    user_id: str | None
    guest_token_hash: str | None
    consented_at: datetime.datetime | None
    state: dict
    started_at: datetime.datetime


class SessionRepository(Protocol):
    def active_case_version(self, case_id: str) -> int | None: ...

    def get_case_content(self, case_id: str, version: int) -> dict | None: ...

    def create(
        self,
        *,
        case_id: str,
        case_version: int,
        mode: str,
        status: str,
        user_id: str | None,
        guest_token_hash: str | None,
        consented_at: datetime.datetime | None,
        state: dict,
    ) -> SessionRecord: ...

    def get(self, session_id: str) -> SessionRecord | None: ...

    def update_state(self, session_id: str, state: dict) -> None: ...


def _to_record(row: models.Session) -> SessionRecord:
    return SessionRecord(
        id=str(row.id),
        case_id=row.case_id,
        case_version=row.case_version,
        mode=row.mode,
        status=row.status,
        user_id=str(row.user_id) if row.user_id else None,
        guest_token_hash=row.guest_token_hash,
        consented_at=row.consented_at,
        state=row.state or {},
        started_at=row.started_at,
    )


class SqlSessionRepository:
    def __init__(self, db: OrmSession) -> None:
        self.db = db

    def active_case_version(self, case_id: str) -> int | None:
        stmt = select(models.Case.version).where(
            models.Case.id == case_id, models.Case.is_active.is_(True)
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def get_case_content(self, case_id: str, version: int) -> dict | None:
        stmt = select(models.Case.content).where(
            models.Case.id == case_id, models.Case.version == version
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def create(self, **kwargs) -> SessionRecord:
        row = models.Session(**kwargs)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return _to_record(row)

    def get(self, session_id: str) -> SessionRecord | None:
        try:
            pk = uuid.UUID(session_id)
        except ValueError:
            return None
        row = self.db.get(models.Session, pk)
        return _to_record(row) if row else None

    def update_state(self, session_id: str, state: dict) -> None:
        row = self.db.get(models.Session, uuid.UUID(session_id))
        if row is not None:
            row.state = state
            self.db.commit()
