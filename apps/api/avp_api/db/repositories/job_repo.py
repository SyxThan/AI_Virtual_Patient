"""Postgres-backed job queue (ADR-0004: `jobs` table, no Redis). Claiming uses
FOR UPDATE SKIP LOCKED so several workers never take the same job."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import text
from sqlalchemy.orm import Session as OrmSession


@dataclass
class JobRecord:
    id: int
    kind: str
    session_id: str | None
    status: str
    attempts: int


class JobRepository(Protocol):
    def enqueue_job(self, kind: str, session_id: str) -> int: ...

    def transition_and_enqueue(
        self, session_id: str, from_statuses: tuple[str, ...], to_status: str, kind: str
    ) -> int | None: ...

    def claim_next_job(self) -> JobRecord | None: ...

    def claim_job(self, job_id: int) -> JobRecord | None: ...

    def mark_done(self, job_id: int) -> None: ...

    def mark_failed(self, job_id: int, error: str) -> None: ...

    def has_open_job(self, session_id: str, kind: str) -> bool: ...


_CLAIM = """
UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_at = now(), updated_at = now()
WHERE id = (
  SELECT id FROM jobs
  WHERE status = 'queued' AND run_after <= now() {extra}
  ORDER BY run_after
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING id, kind, session_id, status, attempts
"""

_INSERT = text("INSERT INTO jobs (kind, session_id) VALUES (:k, :s) RETURNING id")


def _row(r) -> JobRecord | None:
    if r is None:
        return None
    return JobRecord(
        id=r.id,
        kind=r.kind,
        session_id=str(r.session_id) if r.session_id else None,
        status=r.status,
        attempts=r.attempts,
    )


class SqlJobRepository:
    def __init__(self, db: OrmSession) -> None:
        self.db = db

    def enqueue_job(self, kind: str, session_id: str) -> int:
        job_id = self.db.execute(_INSERT, {"k": kind, "s": uuid.UUID(session_id)}).scalar_one()
        self.db.commit()
        return int(job_id)

    def transition_and_enqueue(
        self, session_id: str, from_statuses: tuple[str, ...], to_status: str, kind: str
    ) -> int | None:
        """Atomically move the session from one of `from_statuses` to `to_status`
        and enqueue a job, in one transaction. Returns None (nothing enqueued) if
        the session was not in a from-status: this makes /finish and /retry
        idempotent even under concurrent calls (the UPDATE takes the row lock)."""
        sid = uuid.UUID(session_id)
        try:
            moved = self.db.execute(
                text(
                    "UPDATE sessions SET status = :to, ended_at = COALESCE(ended_at, now()) "
                    "WHERE id = :s AND status = ANY(:from) RETURNING id"
                ),
                {"to": to_status, "s": sid, "from": list(from_statuses)},
            ).scalar_one_or_none()
            if moved is None:
                self.db.rollback()
                return None
            job_id = self.db.execute(_INSERT, {"k": kind, "s": sid}).scalar_one()
            self.db.commit()
            return int(job_id)
        except Exception:
            self.db.rollback()
            raise

    def claim_next_job(self) -> JobRecord | None:
        r = self.db.execute(text(_CLAIM.format(extra=""))).first()
        self.db.commit()
        return _row(r)

    def claim_job(self, job_id: int) -> JobRecord | None:
        r = self.db.execute(text(_CLAIM.format(extra="AND id = :id")), {"id": job_id}).first()
        self.db.commit()
        return _row(r)

    def mark_done(self, job_id: int) -> None:
        self.db.execute(
            text("UPDATE jobs SET status = 'done', updated_at = now() WHERE id = :id"),
            {"id": job_id},
        )
        self.db.commit()

    def mark_failed(self, job_id: int, error: str) -> None:
        self.db.execute(
            text(
                "UPDATE jobs SET status = 'failed', last_error = :e, updated_at = now() "
                "WHERE id = :id"
            ),
            {"id": job_id, "e": error[:500]},
        )
        self.db.commit()

    def has_open_job(self, session_id: str, kind: str) -> bool:
        r = self.db.execute(
            text(
                "SELECT 1 FROM jobs WHERE session_id = :s AND kind = :k "
                "AND status IN ('queued', 'running') LIMIT 1"
            ),
            {"s": uuid.UUID(session_id), "k": kind},
        ).first()
        return r is not None
