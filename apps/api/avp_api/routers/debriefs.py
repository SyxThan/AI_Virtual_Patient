"""Debrief routes: GET /sessions/{id}/debrief (Slice 8, AVP-019) and
GET /sessions/{id}/debrief/pdf (Slice 9, AVP-105).

202 while the evaluate/debrief jobs are pending, 200 with the 5-tier summary and
verified claims when done (or a safe `failed` message). The PDF needs both the
evaluation and the debrief `done`. Sync `def` routes.
"""

from __future__ import annotations

from collections.abc import Callable

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse, Response

from avp_api.auth import current_user_id
from avp_api.config import get_settings
from avp_api.db.repositories.debrief_repo import DebriefRepository, SqlDebriefRepository
from avp_api.db.repositories.evaluation_repo import EvaluationRepository, SqlEvaluationRepository
from avp_api.db.repositories.job_repo import JobRepository, SqlJobRepository
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.session import get_db
from avp_api.schemas.debrief import DebriefResponse
from avp_api.services import (
    debrief_service,
    evaluation_service,
    pdf_service,
    profile_service,
    session_service,
)

router = APIRouter(tags=["debrief"])


def get_session_repo(db=Depends(get_db)) -> SessionRepository:
    return SqlSessionRepository(db)


def get_eval_repo(db=Depends(get_db)) -> EvaluationRepository:
    return SqlEvaluationRepository(db)


def get_debrief_repo(db=Depends(get_db)) -> DebriefRepository:
    return SqlDebriefRepository(db)


def get_job_repo(db=Depends(get_db)) -> JobRepository:
    return SqlJobRepository(db)


def get_display_name_lookup() -> Callable[[str | None], str | None]:
    # Lazy: opens the DB only for a signed-in owner (guests never query profiles).
    return profile_service.display_name_from_db


@router.get(
    "/sessions/{session_id}/debrief",
    response_model=DebriefResponse,
    responses={202: {"model": DebriefResponse, "description": "Debrief pending."}},
)
def get_debrief(
    session_id: str,
    session_repo: SessionRepository = Depends(get_session_repo),
    eval_repo: EvaluationRepository = Depends(get_eval_repo),
    debrief_repo: DebriefRepository = Depends(get_debrief_repo),
    job_repo: JobRepository = Depends(get_job_repo),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
):
    result = debrief_service.get_debrief(
        session_id, session_repo, eval_repo, debrief_repo, job_repo, user_id, x_guest_token
    )
    if result.status == "pending":
        return JSONResponse(status_code=202, content=result.model_dump(mode="json"))
    return result


@router.get(
    "/sessions/{session_id}/debrief/pdf",
    response_class=Response,
    responses={
        200: {"content": {"application/pdf": {}}, "description": "Practice report PDF."},
        202: {"model": DebriefResponse, "description": "Evaluation or debrief pending."},
        409: {"description": "Session not finished, or evaluation/debrief failed."},
    },
)
def get_debrief_pdf(
    session_id: str,
    session_repo: SessionRepository = Depends(get_session_repo),
    eval_repo: EvaluationRepository = Depends(get_eval_repo),
    debrief_repo: DebriefRepository = Depends(get_debrief_repo),
    job_repo: JobRepository = Depends(get_job_repo),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
    display_name_lookup: Callable[[str | None], str | None] = Depends(get_display_name_lookup),
):
    sess = session_service.get_session(session_id, session_repo, user_id, x_guest_token)
    evaluation = evaluation_service.get_evaluation(
        session_id, session_repo, eval_repo, job_repo, user_id, x_guest_token
    )
    debrief = debrief_service.get_debrief(
        session_id, session_repo, eval_repo, debrief_repo, job_repo, user_id, x_guest_token
    )
    if "pending" in (evaluation.status, debrief.status):
        pending = DebriefResponse(status="pending", session_id=session_id)
        return JSONResponse(status_code=202, content=pending.model_dump(mode="json"))
    if evaluation.status != "done" or debrief.status != "done":
        raise HTTPException(
            status_code=409,
            detail={"code": "REPORT_UNAVAILABLE", "message": "Evaluation or debrief failed."},
        )
    case = session_repo.get_case_content(sess.case_id, sess.case_version) or {}
    # The ownership check above passed, so a non-None caller is the session owner
    # (a signed-in user opening an unclaimed guest session is not: print no name).
    owner_id = user_id if session_repo.get(session_id).user_id == user_id else None
    pdf = pdf_service.generate_debrief_pdf(
        sess, evaluation, debrief, case, get_settings().web_base_url, display_name_lookup(owner_id)
    )
    filename = f"avp-practice-report-{session_id[:8]}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
