"""Case data access for the case library (Slice 20, AVP-147).

Reads the `cases` table only (no migration). A Protocol so services depend on an
interface; tests use an in-memory fake with synthetic content.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from avp_api.db import models


@dataclass
class CaseRecord:
    id: str
    version: int
    content: dict
    review_status: str


class CaseRepository(Protocol):
    def list_active(self) -> list[CaseRecord]: ...

    def get_active(self, case_id: str) -> CaseRecord | None: ...


def _to_record(row: models.Case) -> CaseRecord:
    return CaseRecord(
        id=row.id,
        version=row.version,
        content=row.content or {},
        review_status=row.review_status,
    )


class SqlCaseRepository:
    def __init__(self, db: OrmSession) -> None:
        self.db = db

    def list_active(self) -> list[CaseRecord]:
        stmt = select(models.Case).where(models.Case.is_active.is_(True))
        return [_to_record(row) for row in self.db.execute(stmt).scalars()]

    def get_active(self, case_id: str) -> CaseRecord | None:
        stmt = select(models.Case).where(models.Case.id == case_id, models.Case.is_active.is_(True))
        row = self.db.execute(stmt).scalar_one_or_none()
        return _to_record(row) if row else None
