"""Session routes (thin): POST /sessions, GET /sessions/{id}. ADR-0011."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Response

from avp_api.auth import current_user_id
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.session import get_db
from avp_api.schemas.session import SessionCreate, SessionResponse
from avp_api.services import session_service

router = APIRouter(tags=["sessions"])


def get_session_repo(db=Depends(get_db)) -> SessionRepository:
    return SqlSessionRepository(db)


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


@router.get("/sessions/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: str,
    repo: SessionRepository = Depends(get_session_repo),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> SessionResponse:
    return session_service.get_session(session_id, repo, user_id, x_guest_token)
