"""Profile and claim routes (thin; Slice 10, AVP-108). ADR-0008, ADR-0011.

GET/PATCH/DELETE /me and POST /sessions/{session_id}/claim all require a
signed-in user; a guest gets 401 AUTH_REQUIRED. DELETE /me: Slice 13, AVP-115.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header

from avp_api.auth import require_user_id
from avp_api.db.repositories.privacy_repo import PrivacyRepository, SqlPrivacyRepository
from avp_api.db.repositories.profile_repo import ProfileRepository, SqlProfileRepository
from avp_api.db.session import get_db
from avp_api.schemas.me import ClaimResponse, MeResponse, MeUpdate
from avp_api.schemas.privacy import DeleteMeResponse
from avp_api.services import privacy_service, profile_service
from avp_api.services.privacy_service import AccountDeleter

router = APIRouter(tags=["me"])


def get_profile_repo(db=Depends(get_db)) -> ProfileRepository:
    return SqlProfileRepository(db)


def get_privacy_repo(db=Depends(get_db)) -> PrivacyRepository:
    return SqlPrivacyRepository(db)


def get_account_deleter() -> AccountDeleter | None:
    return privacy_service.configured_account_deleter()


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


@router.delete("/me", response_model=DeleteMeResponse)
def delete_me(
    user_id: str = Depends(require_user_id),
    repo: PrivacyRepository = Depends(get_privacy_repo),
    account_deleter: AccountDeleter | None = Depends(get_account_deleter),
) -> DeleteMeResponse:
    """Delete all of the caller's sessions and their profile; the Supabase Auth
    user too when the server holds a secret key (else account_deleted=false)."""
    return privacy_service.delete_me(user_id, repo, account_deleter)


@router.post("/sessions/{session_id}/claim", response_model=ClaimResponse)
def claim_session(
    session_id: str,
    user_id: str = Depends(require_user_id),
    repo: ProfileRepository = Depends(get_profile_repo),
    x_guest_token: str | None = Header(default=None),
) -> ClaimResponse:
    return profile_service.claim_session(session_id, user_id, x_guest_token, repo)
