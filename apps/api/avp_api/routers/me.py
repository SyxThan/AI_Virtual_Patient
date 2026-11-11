"""Profile and claim routes (thin; Slice 10, AVP-108). ADR-0008, ADR-0011.

GET/PATCH /me and POST /sessions/{session_id}/claim all require a signed-in
user; a guest gets 401 AUTH_REQUIRED.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header

from avp_api.auth import require_user_id
from avp_api.db.repositories.profile_repo import ProfileRepository, SqlProfileRepository
from avp_api.db.session import get_db
from avp_api.schemas.me import ClaimResponse, MeResponse, MeUpdate
from avp_api.services import profile_service

router = APIRouter(tags=["me"])


def get_profile_repo(db=Depends(get_db)) -> ProfileRepository:
    return SqlProfileRepository(db)


@router.get("/me", response_model=MeResponse)
def get_me(
    user_id: str = Depends(require_user_id),
    repo: ProfileRepository = Depends(get_profile_repo),
) -> MeResponse:
    return profile_service.get_me(user_id, repo)


@router.patch("/me", response_model=MeResponse)
def update_me(
    payload: MeUpdate,
    user_id: str = Depends(require_user_id),
    repo: ProfileRepository = Depends(get_profile_repo),
) -> MeResponse:
    return profile_service.update_me(user_id, payload.display_name, repo)


@router.post("/sessions/{session_id}/claim", response_model=ClaimResponse)
def claim_session(
    session_id: str,
    user_id: str = Depends(require_user_id),
    repo: ProfileRepository = Depends(get_profile_repo),
    x_guest_token: str | None = Header(default=None),
) -> ClaimResponse:
    return profile_service.claim_session(session_id, user_id, x_guest_token, repo)
