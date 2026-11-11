"""Privacy data access: delete a session, delete a user's data, expire guest
sessions (Slice 13, AVP-115; ADR-0007, database.md "Security" item 6).

Only the `sessions` and `profiles` rows are deleted explicitly. Every table that
holds session data references `sessions(id) on delete cascade` (turns,
evaluations -> evaluation_items, debriefs, jobs, fallback_hits; see
alembic/versions/0001_initial_schema.py), so Postgres removes the children in the
same transaction. No migration is needed.
"""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session as OrmSession

from avp_api.db import models


@dataclass
class UserDataDeletion:
    sessions_deleted: int
    profile_deleted: bool


class PrivacyRepository(Protocol):
    def delete_owned_session(
        self, session_id: str, user_id: str | None, guest_token_hash: str | None
    ) -> bool:
        """Delete the session only if the caller owns it (one statement). True if deleted."""
        ...

    def delete_user_data(self, user_id: str) -> UserDataDeletion:
        """Delete every session of `user_id` and the profile row, in one transaction."""
        ...

    def count_expired_guest_sessions(self, cutoff: datetime.datetime) -> int: ...

    def delete_expired_guest_sessions(self, cutoff: datetime.datetime) -> int: ...


def _uuid(value: str | None) -> uuid.UUID | None:
    if value is None:
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def _expired_guest(cutoff: datetime.datetime):
    # Guests only: a signed-in user's session (user_id set) is never expired here.
    return and_(models.Session.user_id.is_(None), models.Session.started_at < cutoff)


class SqlPrivacyRepository:
    def __init__(self, db: OrmSession) -> None:
        self.db = db

    def delete_owned_session(
        self, session_id: str, user_id: str | None, guest_token_hash: str | None
    ) -> bool:
        sid, uid = _uuid(session_id), _uuid(user_id)
        if sid is None:
            return False
        owner_clauses = []
        if uid is not None:
            owner_clauses.append(models.Session.user_id == uid)
        if guest_token_hash:
            owner_clauses.append(
                and_(
                    models.Session.user_id.is_(None),
                    models.Session.guest_token_hash == guest_token_hash,
                )
            )
        if not owner_clauses:
            return False
        # The ownership predicate is part of the DELETE itself, so a session claimed
        # by a user between the service's ownership check and this statement is not
        # deleted with its old guest token (no check-then-act race).
        try:
            res = self.db.execute(
                delete(models.Session)
                .where(models.Session.id == sid, or_(*owner_clauses))
                .execution_options(synchronize_session=False)
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return res.rowcount == 1

    def delete_user_data(self, user_id: str) -> UserDataDeletion:
        uid = uuid.UUID(user_id)
        try:
            sessions = self.db.execute(
                delete(models.Session)
                .where(models.Session.user_id == uid)
                .execution_options(synchronize_session=False)
            )
            profile = self.db.execute(
                delete(models.Profile)
                .where(models.Profile.user_id == uid)
                .execution_options(synchronize_session=False)
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return UserDataDeletion(
            sessions_deleted=int(sessions.rowcount or 0),
            profile_deleted=(profile.rowcount or 0) > 0,
        )

    def count_expired_guest_sessions(self, cutoff: datetime.datetime) -> int:
        stmt = select(func.count()).select_from(models.Session).where(_expired_guest(cutoff))
        return int(self.db.execute(stmt).scalar_one())

    def delete_expired_guest_sessions(self, cutoff: datetime.datetime) -> int:
        try:
            res = self.db.execute(
                delete(models.Session)
                .where(_expired_guest(cutoff))
                .execution_options(synchronize_session=False)
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return int(res.rowcount or 0)
