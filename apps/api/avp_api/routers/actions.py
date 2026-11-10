"""Clinical action routes: POST /sessions/{id}/actions (physical exam).

Synchronous (DB only, no LLM), like sessions/vitals, so the sync SQLAlchemy
session is created and used in one thread.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header

from avp_api.auth import current_user_id
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.repositories.turn_repo import SqlTurnRepository, TurnRepository
from avp_api.db.session import get_db
from avp_api.schemas.action import ExamActionRequest, ExamActionResponse
from avp_api.services import exam_service

router = APIRouter(tags=["actions"])


def get_session_repo(db=Depends(get_db)) -> SessionRepository:
    return SqlSessionRepository(db)


def get_turn_repo(db=Depends(get_db)) -> TurnRepository:
    return SqlTurnRepository(db)


@router.post("/sessions/{session_id}/actions", response_model=ExamActionResponse)
def post_action(
    session_id: str,
    payload: ExamActionRequest,
    session_repo: SessionRepository = Depends(get_session_repo),
    turn_repo: TurnRepository = Depends(get_turn_repo),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> ExamActionResponse:
    return exam_service.perform_action(
        session_id, payload, session_repo, turn_repo, user_id, x_guest_token
    )
