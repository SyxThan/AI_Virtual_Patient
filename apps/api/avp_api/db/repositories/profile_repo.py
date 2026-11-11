"""Profile data access and the guest-session claim (AVP-106/108; ADR-0007).

The only place profiles SQL (and the claim UPDATE on sessions) lives. A Protocol
so services depend on an interface; tests use an in-memory fake.
"""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass
from typing import Literal, Protocol

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session as OrmSession

from avp_api.db import models

ClaimResult = Literal["claimed", "already_owned", "not_found"]


@dataclass
class ProfileRecord:
    user_id: str
    display_name: str | None
    role: str
    created_at: datetime.datetime


class ProfileRepository(Protocol):
    def ensure(self, user_id: str) -> ProfileRecord:
        """Insert a student profile if missing (idempotent) and return it."""
        ...

    def get(self, user_id: str) -> ProfileRecord | None: ...

    def set_display_name(self, user_id: str, display_name: str | None) -> ProfileRecord: ...

    def claim_session(self, session_id: str, user_id: str, guest_token_hash: str) -> ClaimResult:
        """Atomically move a guest session to `user_id` (clears guest_token_hash)."""
        ...


def _to_record(row: models.Profile) -> ProfileRecord:
    return ProfileRecord(
        user_id=str(row.user_id),
        display_name=row.display_name,
        role=row.role,
        created_at=row.created_at,
    )


def _uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


class SqlProfileRepository:
    def __init__(self, db: OrmSession) -> None:
        self.db = db

    def ensure(self, user_id: str) -> ProfileRecord:
        uid = uuid.UUID(user_id)
        self.db.execute(
            insert(models.Profile)
            .values(user_id=uid, role="student")
            .on_conflict_do_nothing(index_elements=[models.Profile.user_id])
        )
        self.db.commit()
        row = self.db.get(models.Profile, uid)
        assert row is not None
        return _to_record(row)

    def get(self, user_id: str) -> ProfileRecord | None:
        uid = _uuid(user_id)
        row = self.db.get(models.Profile, uid) if uid else None
        return _to_record(row) if row else None

    def set_display_name(self, user_id: str, display_name: str | None) -> ProfileRecord:
        self.ensure(user_id)
        row = self.db.get(models.Profile, uuid.UUID(user_id))
        assert row is not None
        row.display_name = display_name
        self.db.commit()
        return _to_record(row)

    def claim_session(self, session_id: str, user_id: str, guest_token_hash: str) -> ClaimResult:
        sid, uid = _uuid(session_id), uuid.UUID(user_id)
        if sid is None:
            return "not_found"
        # One statement = one transaction: both columns change together, so the
        # sessions CHECK ((user_id is null) = (guest_token_hash is not null))
        # holds before and after. Only a still-guest row with the matching hash moves.
        res = self.db.execute(
            update(models.Session)
            .where(
                models.Session.id == sid,
                models.Session.user_id.is_(None),
                models.Session.guest_token_hash == guest_token_hash,
            )
            .values(user_id=uid, guest_token_hash=None)
        )
        self.db.commit()
        if res.rowcount == 1:
            return "claimed"
        owner = self.db.execute(
            select(models.Session.user_id).where(models.Session.id == sid)
        ).scalar_one_or_none()
        return "already_owned" if owner == uid else "not_found"
