"""Guided vs exam mode (Slice 12, AVP-112 / TASK-S12-03).

- Guided mode: a reminder checklist built ONLY from the case rubric (criterion
  id, domain id, criterion title as written). Anchors, expected questions,
  weights and critical flags are never exposed: the checklist must not reveal
  the answer key. Ticking is manual in the UI; nothing here scores anything.
- Exam mode: no checklist items at all (hidden by the API, not only the UI),
  and an optional time limit from config (`exam_time_limit_s`, default None
  because the value is undecided, docs/OPEN_QUESTIONS.md Q9).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from avp_api.config import get_settings
from avp_api.db.repositories.session_repo import SessionRepository
from avp_api.schemas.guide import GuideItem, GuideResponse
from avp_api.services import session_service

DRAFT_NOTICE = (
    "Checklist wording is taken from the draft case rubric and needs clinician review. "
    "It is a practice reminder only: ticking an item does not score anything."
)
EXAM_NOTICE = "Exam mode: the reminder checklist is hidden."


def time_limit_for(mode: str) -> int | None:
    """Exam sessions only; guided sessions are never time-limited."""
    if mode != "exam":
        return None
    return get_settings().exam_time_limit_s


def _aware(ts: datetime) -> datetime:
    return ts if ts.tzinfo is not None else ts.replace(tzinfo=UTC)


def deadline_for(mode: str, started_at: datetime) -> datetime | None:
    limit = time_limit_for(mode)
    return None if limit is None else _aware(started_at) + timedelta(seconds=limit)


def time_limit_reached(mode: str, started_at: datetime, now: datetime | None = None) -> bool:
    deadline = deadline_for(mode, started_at)
    return deadline is not None and (now or datetime.now(UTC)) >= deadline


def ensure_within_time_limit(mode: str, started_at: datetime) -> None:
    """Raise 409 TIME_LIMIT_REACHED once an exam session is past its limit."""
    if time_limit_reached(mode, started_at):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "TIME_LIMIT_REACHED",
                "message": "Đã hết thời gian của phiên thi thử. Hãy kết thúc buổi khám.",
            },
        )


def _checklist(case: dict) -> tuple[list[GuideItem], int | None]:
    rubric = case.get("rubric") if isinstance(case, dict) else None
    if not isinstance(rubric, dict):
        return [], None
    items: list[GuideItem] = []
    for raw in rubric.get("items") or []:
        if not isinstance(raw, dict):
            continue
        cid, domain, title = raw.get("id"), raw.get("domain"), raw.get("criterion")
        if isinstance(cid, str) and isinstance(domain, str) and isinstance(title, str):
            items.append(GuideItem(criterion_id=cid, domain=domain, title=title))
    version = rubric.get("version")
    return items, version if isinstance(version, int) else None


def get_guide(
    session_id: str,
    repo: SessionRepository,
    user_id: str | None,
    guest_token: str | None,
) -> GuideResponse:
    # Same ownership check as every other session route (404 on any miss, T-SEC-01).
    sess = session_service.get_session(session_id, repo, user_id, guest_token)
    now = datetime.now(UTC)
    guided = sess.mode != "exam"

    items: list[GuideItem] = []
    version: int | None = None
    if guided:
        case = repo.get_case_content(sess.case_id, sess.case_version)
        if case is None:
            raise HTTPException(
                status_code=404,
                detail={"code": "CASE_NOT_FOUND", "message": "Case content missing."},
            )
        items, version = _checklist(case)

    return GuideResponse(
        session_id=sess.id,
        mode=sess.mode,
        checklist_enabled=guided,
        items=items,
        rubric_version=version,
        review_status="draft",
        notice=DRAFT_NOTICE if guided else EXAM_NOTICE,
        time_limit_s=time_limit_for(sess.mode),
        started_at=sess.created_at,
        server_now=now,
        deadline_at=deadline_for(sess.mode, sess.created_at),
        time_limit_reached=time_limit_reached(sess.mode, sess.created_at, now),
    )
