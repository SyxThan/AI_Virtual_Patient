"""Debrief route (Slice 8, AVP-019): GET /sessions/{id}/debrief.

202 while the evaluate/debrief jobs are pending, 200 with the 5-tier summary and
verified claims when done (or a safe `failed` message). Sync `def` route.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse

from avp_api.auth import current_user_id
from avp_api.db.repositories.debrief_repo import DebriefRepository, SqlDebriefRepository
from avp_api.db.repositories.evaluation_repo import EvaluationRepository, SqlEvaluationRepository
from avp_api.db.repositories.job_repo import JobRepository, SqlJobRepository
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.session import get_db
from avp_api.schemas.debrief import DebriefResponse
from avp_api.services import debrief_service

router = APIRouter(tags=["debrief"])


def get_session_repo(db=Depends(get_db)) -> SessionRepository:
    return SqlSessionRepository(db)


def get_eval_repo(db=Depends(get_db)) -> EvaluationRepository:
    return SqlEvaluationRepository(db)


def get_debrief_repo(db=Depends(get_db)) -> DebriefRepository:
    return SqlDebriefRepository(db)


def get_job_repo(db=Depends(get_db)) -> JobRepository:
    return SqlJobRepository(db)


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
