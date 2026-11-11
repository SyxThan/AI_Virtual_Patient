"""Session routes (thin): POST /sessions, GET /sessions (my history),
GET /sessions/progress, GET /sessions/{id}. ADR-0011."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Query, Response

from avp_api.auth import current_user_id
from avp_api.db.repositories.history_repo import HistoryRepository, SqlHistoryRepository
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.session import get_db
from avp_api.schemas.session import SessionCreate, SessionResponse
from avp_api.schemas.session_list import ProgressResponse, SessionSummaryPage
from avp_api.services import history_service, session_service

router = APIRouter(tags=["sessions"])


def get_session_repo(db=Depends(get_db)) -> SessionRepository:
    return SqlSessionRepository(db)


def get_history_repo(db=Depends(get_db)) -> HistoryRepository:
    return SqlHistoryRepository(db)


@router.post("/sessions", status_code=201, response_model=SessionResponse)
def create_session(
    payload: SessionCreate,
    response: Response,
    repo: SessionRepository = Depends(get_session_repo),
    user_id: str | None = Depends(current_user_id),
) -> SessionResponse:
    result = session_service.create_session(payload, repo, user_id)
    if result.guest_token:
        response.headers["X-Guest-Token"] = result.guest_token
    return result


# Declared before /sessions/{session_id} so "progress" is not read as a session id.
@router.get("/sessions", response_model=SessionSummaryPage)
def list_my_sessions(
    limit: int = Query(default=history_service.DEFAULT_LIMIT, ge=1, le=history_service.MAX_LIMIT),
    cursor: str | None = Query(default=None, max_length=512),
    repo: HistoryRepository = Depends(get_history_repo),
    user_id: str | None = Depends(current_user_id),
) -> SessionSummaryPage:
    return history_service.list_sessions(repo, user_id, limit, cursor)


@router.get("/sessions/progress", response_model=ProgressResponse)
def my_progress(
    repo: HistoryRepository = Depends(get_history_repo),
    user_id: str | None = Depends(current_user_id),
) -> ProgressResponse:
    return history_service.progress(repo, user_id)


@router.get("/sessions/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: str,
    repo: SessionRepository = Depends(get_session_repo),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> SessionResponse:
    return session_service.get_session(session_id, repo, user_id, x_guest_token)
