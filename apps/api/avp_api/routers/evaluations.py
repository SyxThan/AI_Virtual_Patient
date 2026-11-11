"""Evaluation routes (Slice 7, AVP-014): finish, evaluation status/result, retry.

Sync `def` routes (sync SQLAlchemy). After enqueuing, a BackgroundTask runs the
job in-process so a single-process dev setup completes without a separate
worker; a standalone worker (`python -m avp_api.jobs.worker`) can run too: the
job is claimed atomically either way.
"""

from __future__ import annotations

from collections.abc import Callable

from fastapi import APIRouter, BackgroundTasks, Depends, Header
from fastapi.responses import JSONResponse

from avp_api.auth import current_user_id
from avp_api.db.repositories.evaluation_repo import EvaluationRepository, SqlEvaluationRepository
from avp_api.db.repositories.job_repo import JobRepository, SqlJobRepository
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.session import get_db
from avp_api.jobs import worker
from avp_api.schemas.evaluation import EvaluationResponse
from avp_api.schemas.session import SessionResponse
from avp_api.services import evaluation_service

router = APIRouter(tags=["evaluation"])

JobRunner = Callable[[int], None]


def get_session_repo(db=Depends(get_db)) -> SessionRepository:
    return SqlSessionRepository(db)


def get_eval_repo(db=Depends(get_db)) -> EvaluationRepository:
    return SqlEvaluationRepository(db)


def get_job_repo(db=Depends(get_db)) -> JobRepository:
    return SqlJobRepository(db)


def get_job_runner() -> JobRunner:
    return worker.run_job_by_id


@router.post("/sessions/{session_id}/finish", response_model=SessionResponse)
def finish_session(
    session_id: str,
    background: BackgroundTasks,
    session_repo: SessionRepository = Depends(get_session_repo),
    job_repo: JobRepository = Depends(get_job_repo),
    runner: JobRunner = Depends(get_job_runner),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> SessionResponse:
    sess, job_id = evaluation_service.finish_session(
        session_id, session_repo, job_repo, user_id, x_guest_token
    )
    if job_id is not None:
        background.add_task(runner, job_id)
    return sess


@router.get(
    "/sessions/{session_id}/evaluation",
    response_model=EvaluationResponse,
    responses={202: {"model": EvaluationResponse, "description": "Evaluation pending."}},
)
def get_evaluation(
    session_id: str,
    session_repo: SessionRepository = Depends(get_session_repo),
    eval_repo: EvaluationRepository = Depends(get_eval_repo),
    job_repo: JobRepository = Depends(get_job_repo),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
):
    result = evaluation_service.get_evaluation(
        session_id, session_repo, eval_repo, job_repo, user_id, x_guest_token
    )
    if result.status == "pending":
        return JSONResponse(status_code=202, content=result.model_dump(mode="json"))
    return result


@router.post("/sessions/{session_id}/evaluation/retry", response_model=SessionResponse)
def retry_evaluation(
    session_id: str,
    background: BackgroundTasks,
    session_repo: SessionRepository = Depends(get_session_repo),
    job_repo: JobRepository = Depends(get_job_repo),
    runner: JobRunner = Depends(get_job_runner),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> SessionResponse:
    sess, job_id = evaluation_service.retry_evaluation(
        session_id, session_repo, job_repo, user_id, x_guest_token
    )
    background.add_task(runner, job_id)
    return sess
