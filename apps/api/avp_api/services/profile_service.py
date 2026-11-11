"""Profile and guest-claim logic (Slice 10, AVP-106/108).

- First seen JWT `sub` -> a `profiles` row with role `student` (best effort,
  called by the JWT verifier; `get_me` ensures it again).
- Claim: a signed-in user who holds a session's guest token takes ownership.
  Any miss (wrong token, foreign owner, unknown id) is 404, never 403, so the
  existence of other sessions is not leaked (T-SEC-01, T-AUTH-02).
"""

from __future__ import annotations

import logging

from fastapi import HTTPException

from avp_api.db.repositories.profile_repo import ProfileRecord, ProfileRepository
from avp_api.schemas.me import ClaimResponse, MeResponse
from avp_api.services.session_service import _hash_guest_token

logger = logging.getLogger("avp_api.profile")


def _to_me(rec: ProfileRecord) -> MeResponse:
    return MeResponse(
        user_id=rec.user_id,
        display_name=rec.display_name,
        role=rec.role,
        created_at=rec.created_at,
    )


def get_me(user_id: str, repo: ProfileRepository) -> MeResponse:
    return _to_me(repo.ensure(user_id))


def update_me(user_id: str, display_name: str | None, repo: ProfileRepository) -> MeResponse:
    return _to_me(repo.set_display_name(user_id, display_name))


def claim_session(
    session_id: str, user_id: str, guest_token: str | None, repo: ProfileRepository
) -> ClaimResponse:
    not_found = HTTPException(
        status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "Session not found."}
    )
    if not guest_token:
        raise not_found
    result = repo.claim_session(session_id, user_id, _hash_guest_token(guest_token))
    if result == "not_found":
        raise not_found
    return ClaimResponse(session_id=session_id, status=result)


def display_name_for(user_id: str | None, repo: ProfileRepository) -> str | None:
    if user_id is None:
        return None
    rec = repo.get(user_id)
    return rec.display_name if rec else None


# --- lazy DB helpers (open a connection only when actually called) ---------------


def ensure_profile_in_db(user_id: str) -> None:
    from avp_api.db.repositories.profile_repo import SqlProfileRepository
    from avp_api.db.session import _maker

    with _maker()() as db:
        SqlProfileRepository(db).ensure(user_id)


def display_name_from_db(user_id: str | None) -> str | None:
    """Best effort for the PDF header: a report without a name beats no report."""
    if user_id is None:  # guests never touch the profiles table
        return None
    from avp_api.db.repositories.profile_repo import SqlProfileRepository
    from avp_api.db.session import _maker

    try:
        with _maker()() as db:
            return display_name_for(user_id, SqlProfileRepository(db))
    except Exception as exc:  # noqa: BLE001 - log the type only, never data
        logger.warning("display name lookup failed: %s", type(exc).__name__)
        return None
