"""Session guide route (thin): GET /sessions/{id}/guide (Slice 12, AVP-112).

Guided mode returns the rubric-derived reminder checklist (draft wording);
exam mode returns no items and the configured time limit. DB only, no LLM.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header

from avp_api.auth import current_user_id
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.session import get_db
from avp_api.schemas.guide import GuideResponse
from avp_api.services import guide_service

router = APIRouter(tags=["sessions"])


def get_session_repo(db=Depends(get_db)) -> SessionRepository:
    return SqlSessionRepository(db)


@router.get("/sessions/{session_id}/guide", response_model=GuideResponse)
def get_guide(
    session_id: str,
    repo: SessionRepository = Depends(get_session_repo),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> GuideResponse:
    return guide_service.get_guide(session_id, repo, user_id, x_guest_token)
