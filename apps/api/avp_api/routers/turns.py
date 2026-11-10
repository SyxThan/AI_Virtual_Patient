"""Turn routes (hot path): POST/GET /sessions/{id}/turns."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header

from avp_api.auth import current_user_id
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.repositories.turn_repo import SqlTurnRepository, TurnRepository
from avp_api.db.session import get_db
from avp_api.providers.llm import LLMProvider, get_llm_provider
from avp_api.schemas.turn import TurnCreate, TurnResponse
from avp_api.services import turns_service

router = APIRouter(tags=["turns"])


def get_session_repo(db=Depends(get_db)) -> SessionRepository:
    return SqlSessionRepository(db)


def get_turn_repo(db=Depends(get_db)) -> TurnRepository:
    return SqlTurnRepository(db)


def get_provider() -> LLMProvider:
    return get_llm_provider()


@router.post("/sessions/{session_id}/turns", response_model=TurnResponse)
def create_turn(
    session_id: str,
    payload: TurnCreate,
    session_repo: SessionRepository = Depends(get_session_repo),
    turn_repo: TurnRepository = Depends(get_turn_repo),
    provider: LLMProvider = Depends(get_provider),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> TurnResponse:
    return turns_service.submit_turn(
        session_id, payload.text, session_repo, turn_repo, provider, user_id, x_guest_token
    )


@router.get("/sessions/{session_id}/turns", response_model=list[TurnResponse])
def list_turns(
    session_id: str,
    session_repo: SessionRepository = Depends(get_session_repo),
    turn_repo: TurnRepository = Depends(get_turn_repo),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> list[TurnResponse]:
    return turns_service.list_turns(session_id, session_repo, turn_repo, user_id, x_guest_token)
