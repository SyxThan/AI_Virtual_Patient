"""Session business logic (Slice 2, AVP-008).

Consent gate, guest-token issuance (hashed at rest), case-version pinning, and
the ownership check used by every session-owned route (T-SEC-01).
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime

from fastapi import HTTPException

from avp_api.db.repositories.session_repo import SessionRecord, SessionRepository
from avp_api.schemas.session import SessionCreate, SessionResponse


def _hash_guest_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _to_response(rec: SessionRecord, guest_token: str | None) -> SessionResponse:
    return SessionResponse(
        id=rec.id,
        case_id=rec.case_id,
        case_version=rec.case_version,
        mode=rec.mode,
        role=rec.state.get("role", "student"),
        status=rec.status,
        created_at=rec.started_at,
        guest_token=guest_token,
    )


def create_session(
    payload: SessionCreate, repo: SessionRepository, user_id: str | None
) -> SessionResponse:
    if not payload.consent:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "CONSENT_REQUIRED",
                "message": "Informed consent is required to start a practice session.",
            },
        )
    version = repo.active_case_version(payload.case_id)
    if version is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "CASE_NOT_FOUND",
                "message": f"Case '{payload.case_id}' is not loaded.",
            },
        )

    guest_token: str | None = None
    guest_token_hash: str | None = None
    if user_id is None:
        guest_token = secrets.token_hex(32)
        guest_token_hash = _hash_guest_token(guest_token)

    rec = repo.create(
        case_id=payload.case_id,
        case_version=version,
        mode=payload.mode,
        status="active",
        user_id=user_id,
        guest_token_hash=guest_token_hash,
        consented_at=datetime.now(UTC),
        state={"role": payload.role},
    )
    return _to_response(rec, guest_token)


def get_session(
    session_id: str, repo: SessionRepository, user_id: str | None, guest_token: str | None
) -> SessionResponse:
    rec = repo.get(session_id)
    # 404 (not 403) on any ownership miss, so existence is not leaked (T-SEC-01).
    not_found = HTTPException(
        status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "Session not found."}
    )
    if rec is None:
        raise not_found
    if rec.user_id is not None:
        if user_id != rec.user_id:
            raise not_found
    elif not guest_token or _hash_guest_token(guest_token) != rec.guest_token_hash:
        raise not_found
    return _to_response(rec, None)
