"""Delete-my-data logic (Slice 13, AVP-115; T-PRIV-01, T-SEC-01, Hard Rule 6).

- DELETE /sessions/{id}: the owner (Bearer user, or the guest token holder of a
  guest session) deletes one session. Any miss is 404, never 403, so the
  existence of other people's sessions is not leaked. Child rows go by FK cascade.
- DELETE /me: a signed-in user deletes all their sessions and their profile. If a
  server-side Supabase secret key is configured, the Supabase Auth user is also
  deleted through the Admin API; otherwise `account_deleted` is false and the UI
  explains how to ask for the login account itself to be removed.

The secret key is only ever placed in request headers: it is never logged, never
returned, never part of a URL or an exception message we produce.
"""

from __future__ import annotations

import logging
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable

from fastapi import HTTPException

from avp_api.config import get_settings
from avp_api.db.repositories.privacy_repo import PrivacyRepository
from avp_api.db.repositories.session_repo import SessionRepository
from avp_api.schemas.privacy import DeleteMeResponse
from avp_api.services import session_service
from avp_api.services.session_service import _hash_guest_token

logger = logging.getLogger("avp_api.privacy")

ADMIN_API_TIMEOUT_S = 8.0

# Deletes the Supabase Auth user `user_id`; True if the account no longer exists.
AccountDeleter = Callable[[str], bool]


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "Session not found."}
    )


def delete_session(
    session_id: str,
    session_repo: SessionRepository,
    privacy_repo: PrivacyRepository,
    user_id: str | None,
    guest_token: str | None,
) -> None:
    # The same ownership check as every other session route (raises 404 on a miss)...
    session_service.get_session(session_id, session_repo, user_id, guest_token)
    # ...and the DELETE repeats it in SQL, so ownership cannot change in between.
    token_hash = _hash_guest_token(guest_token) if guest_token else None
    if not privacy_repo.delete_owned_session(session_id, user_id, token_hash):
        raise _not_found()


def delete_me(
    user_id: str, privacy_repo: PrivacyRepository, account_deleter: AccountDeleter | None
) -> DeleteMeResponse:
    result = privacy_repo.delete_user_data(user_id)
    account_deleted = False
    if account_deleter is not None:
        try:
            account_deleted = bool(account_deleter(user_id))
        except Exception as exc:  # noqa: BLE001 - data is already gone; report honestly
            logger.warning("auth user deletion failed: %s", type(exc).__name__)
            account_deleted = False
    return DeleteMeResponse(
        sessions_deleted=result.sessions_deleted,
        profile_deleted=result.profile_deleted,
        account_deleted=account_deleted,
    )


# --- Supabase Admin API -----------------------------------------------------------


def delete_supabase_auth_user(
    supabase_url: str, secret_key: str, user_id: str, timeout_s: float = ADMIN_API_TIMEOUT_S
) -> bool:
    """DELETE {SUPABASE_URL}/auth/v1/admin/users/{id}. True on 2xx, or 404 (the
    account is already gone); False otherwise. Logs the status code only."""
    url = f"{supabase_url.rstrip('/')}/auth/v1/admin/users/{urllib.parse.quote(user_id, safe='')}"
    req = urllib.request.Request(
        url,
        method="DELETE",
        headers={"apikey": secret_key, "Authorization": f"Bearer {secret_key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:  # noqa: S310
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return True
        logger.warning("auth user deletion rejected: status=%d", exc.code)
        return False
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.warning("auth user deletion unavailable: %s", type(exc).__name__)
        return False


def configured_account_deleter() -> AccountDeleter | None:
    """The Admin API deleter when SUPABASE_URL and SUPABASE_SECRET_KEY are both set."""
    s = get_settings()
    if not s.supabase_url or not s.supabase_secret_key:
        return None
    url, key = s.supabase_url, s.supabase_secret_key
    return lambda uid: delete_supabase_auth_user(url, key, uid)
