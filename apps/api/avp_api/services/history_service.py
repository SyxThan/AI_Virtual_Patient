"""Practice history and progress (Slice 11, AVP-109).

Signed-in users only: a guest has no durable identity, so both routes return
401 AUTH_REQUIRED. Rows are always filtered by the caller's user id in the
repository; there is no way to ask for another user's sessions.
"""

from __future__ import annotations

import base64
import binascii
import json
import uuid
from datetime import datetime

from fastapi import HTTPException

from avp_api.db.repositories.history_repo import (
    Cursor,
    HistoryRepository,
    SessionSummaryRow,
)
from avp_api.schemas.session_list import (
    ProgressAttempt,
    ProgressCriterion,
    ProgressResponse,
    ProgressRubricGroup,
    SessionSummary,
    SessionSummaryPage,
)

DEFAULT_LIMIT = 20
MAX_LIMIT = 50


def require_user(user_id: str | None) -> str:
    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "AUTH_REQUIRED",
                "message": "Sign in to see your practice history.",
            },
        )
    return user_id


def encode_cursor(started_at: datetime, session_id: str) -> str:
    raw = json.dumps({"s": started_at.isoformat(), "i": session_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> Cursor:
    bad = HTTPException(
        status_code=400,
        detail={"code": "INVALID_CURSOR", "message": "The page cursor is not valid."},
    )
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
        started = datetime.fromisoformat(data["s"])
        sid = str(uuid.UUID(data["i"]))
    except (binascii.Error, ValueError, KeyError, TypeError, UnicodeDecodeError):
        raise bad from None
    if started.tzinfo is None:
        raise bad
    return started, sid


def _evaluation_status(row: SessionSummaryRow) -> str:
    if row.evaluation_status in ("pending", "done", "failed"):
        return row.evaluation_status
    # Finished but the evaluate job has not written a row yet.
    return "pending" if row.status == "evaluating" else "none"


def _summary(row: SessionSummaryRow) -> SessionSummary:
    done = row.evaluation_status == "done"
    return SessionSummary(
        id=row.id,
        case_id=row.case_id,
        case_title=row.case_title,
        mode=row.mode,
        status=row.status,
        started_at=row.started_at,
        ended_at=row.ended_at,
        total_score=row.total_score if done else None,
        critical_missed=row.critical_missed if done else False,
        evaluation_status=_evaluation_status(row),
    )


def list_sessions(
    repo: HistoryRepository, user_id: str | None, limit: int, cursor: str | None
) -> SessionSummaryPage:
    uid = require_user(user_id)
    after = decode_cursor(cursor) if cursor else None
    rows = repo.list_for_user(uid, limit + 1, after)  # one extra row: is there a next page?
    page = rows[:limit]
    next_cursor = (
        encode_cursor(page[-1].started_at, page[-1].id) if len(rows) > limit and page else None
    )
    return SessionSummaryPage(items=[_summary(r) for r in page], next_cursor=next_cursor)


def progress(repo: HistoryRepository, user_id: str | None) -> ProgressResponse:
    uid = require_user(user_id)
    attempts = [
        ProgressAttempt(
            session_id=a.session_id,
            started_at=a.started_at,
            total_score=a.total_score,
            critical_missed=a.critical_missed,
            rubric_version=a.rubric_version,
        )
        for a in repo.done_attempts(uid)
    ]
    groups: dict[int, ProgressRubricGroup] = {}
    for c in repo.criterion_counts(uid):
        group = groups.setdefault(
            c.rubric_version, ProgressRubricGroup(rubric_version=c.rubric_version)
        )
        group.criteria.append(
            ProgressCriterion(
                criterion_id=c.criterion_id,
                criterion=c.criterion or c.criterion_id,
                attempts=c.attempts,
                met=c.met,
                partial=c.partial,
            )
        )
    return ProgressResponse(attempts=attempts, rubric_groups=[groups[v] for v in sorted(groups)])
