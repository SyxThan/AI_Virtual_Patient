"""Vitals routes: GET /sessions/{id}/vitals, POST /sessions/{id}/vitals/events.

Synchronous (DB only, no LLM) — the sessions/vitals routes stay `def` so the sync
SQLAlchemy session is created and used in one thread.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header

from avp_api.auth import current_user_id
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.session import get_db
from avp_api.schemas.vitals import VitalsEventRequest, VitalsSnapshot
from avp_api.services import vitals_service

router = APIRouter(tags=["vitals"])


def get_session_repo(db=Depends(get_db)) -> SessionRepository:
    return SqlSessionRepository(db)


@router.get("/sessions/{session_id}/vitals", response_model=VitalsSnapshot)
def get_vitals(
    session_id: str,
    repo: SessionRepository = Depends(get_session_repo),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> VitalsSnapshot:
    return vitals_service.get_vitals(session_id, repo, user_id, x_guest_token)


@router.post("/sessions/{session_id}/vitals/events", response_model=VitalsSnapshot)
def post_vitals_event(
    session_id: str,
    payload: VitalsEventRequest,
    repo: SessionRepository = Depends(get_session_repo),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> VitalsSnapshot:
    return vitals_service.apply_event(session_id, payload.event, repo, user_id, x_guest_token)
