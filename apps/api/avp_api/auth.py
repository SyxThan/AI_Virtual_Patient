"""Request authentication (ADR-0008, AVP-106).

Resolves the current user id from a Supabase Bearer JWT, or None for a guest.
`SupabaseJwtVerifier` checks the token against the project's public JWKS
(`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`): asymmetric signature only
(RS256/ES256), `exp`, `iss`, `aud`. Without SUPABASE_URL the default verifier
refuses every bearer token (guest-only mode). Tests override `get_verifier`.

A token is never logged: failures log the exception type only.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import urllib.request
import uuid
from collections.abc import Callable
from typing import Any, Protocol

import jwt
from fastapi import Depends, Header, HTTPException

from avp_api.config import get_settings

logger = logging.getLogger("avp_api.auth")

ALLOWED_ALGORITHMS = ("RS256", "ES256")  # never HS256 / "none" (no shared secret)
JWKS_FETCH_TIMEOUT_S = 5.0
MIN_REFETCH_INTERVAL_S = 30.0  # unknown-kid refetch rate limit (random kids cannot DoS us)
LEEWAY_S = 10  # clock skew tolerance for exp/iat
# With no keys cached yet, a failed JWKS fetch would turn every signed-in request into
# a 503, so the first fetch retries a transient network error before giving up (AVP-124).
COLD_FETCH_BACKOFF_S = (0.3, 1.0)


class TokenVerifier(Protocol):
    def verify(self, token: str) -> str:
        """Return the user id (JWT `sub`) or raise HTTPException(401)."""
        ...


def _invalid() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail={"code": "AUTH_INVALID", "message": "Invalid or expired access token."},
    )


class UnconfiguredVerifier:
    """Default without SUPABASE_URL: refuse bearer tokens (guest-only mode)."""

    def verify(self, token: str) -> str:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "AUTH_UNAVAILABLE",
                "message": "Token authentication is not configured.",
            },
        )


def fetch_jwks(url: str) -> dict[str, Any]:
    """GET the public JWKS document (no credentials involved)."""
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=JWKS_FETCH_TIMEOUT_S) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8"))


def _describe(exc: BaseException) -> str:
    """Exception type plus, for URL errors, the underlying reason type (no secrets)."""
    reason = getattr(exc, "reason", None)
    if isinstance(reason, BaseException):
        return f"{type(exc).__name__}({type(reason).__name__})"
    code = getattr(exc, "code", None)
    return f"{type(exc).__name__}({code})" if isinstance(code, int) else type(exc).__name__


class SupabaseJwtVerifier:
    """Verify Supabase access tokens with the project's JWKS (cached with a TTL)."""

    def __init__(
        self,
        supabase_url: str,
        audience: str = "authenticated",
        cache_ttl_s: float = 600.0,
        *,
        fetch: Callable[[str], dict[str, Any]] = fetch_jwks,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        on_first_seen: Callable[[str], None] | None = None,
    ) -> None:
        base = supabase_url.rstrip("/")
        self.issuer = f"{base}/auth/v1"
        self.jwks_url = f"{self.issuer}/.well-known/jwks.json"
        self.audience = audience
        self.cache_ttl_s = cache_ttl_s
        self._fetch = fetch
        self._clock = clock
        self._sleep = sleep
        self._on_first_seen = on_first_seen
        self._lock = threading.Lock()
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at: float | None = None
        self._seen: set[str] = set()

    # --- JWKS cache -------------------------------------------------------------

    def _fetch_doc(self) -> Any:
        if self._fetched_at is not None:  # stale keys still verify: no need to wait here
            return self._fetch(self.jwks_url)
        for delay in COLD_FETCH_BACKOFF_S:
            try:
                return self._fetch(self.jwks_url)
            except Exception as exc:  # noqa: BLE001 - network/JSON: retry, then report
                logger.warning("jwks fetch failed, retrying: %s", _describe(exc))
                self._sleep(delay)
        return self._fetch(self.jwks_url)

    def _refresh(self) -> None:
        doc = self._fetch_doc()
        keys: dict[str, jwt.PyJWK] = {}
        for jwk in doc.get("keys", []) if isinstance(doc, dict) else []:
            if not isinstance(jwk, dict) or not jwk.get("kid"):
                continue
            if jwk.get("use") not in (None, "sig"):
                continue
            try:
                keys[str(jwk["kid"])] = jwt.PyJWK(jwk)
            except jwt.PyJWTError:
                continue  # unsupported key type (e.g. a symmetric "oct" key): ignore
        self._keys = keys
        self._fetched_at = self._clock()

    def _key_for(self, kid: str) -> jwt.PyJWK | None:
        with self._lock:
            now = self._clock()
            stale = self._fetched_at is None or now - self._fetched_at >= self.cache_ttl_s
            may_refetch = self._fetched_at is None or now - self._fetched_at >= min(
                MIN_REFETCH_INTERVAL_S, self.cache_ttl_s
            )
            if stale or (kid not in self._keys and may_refetch):
                try:
                    self._refresh()
                except Exception as exc:  # noqa: BLE001 - network/JSON: keep stale keys
                    logger.warning(
                        "jwks fetch failed: %s (url %s; check network access to Supabase)",
                        _describe(exc),
                        self.jwks_url,
                    )
                    if self._fetched_at is None:
                        raise HTTPException(
                            status_code=503,
                            detail={
                                "code": "AUTH_UNAVAILABLE",
                                "message": "Sign-in verification is temporarily unavailable.",
                            },
                        ) from None
            return self._keys.get(kid)

    # --- verification -----------------------------------------------------------

    def verify(self, token: str) -> str:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError:
            raise _invalid() from None
        alg, kid = header.get("alg"), header.get("kid")
        if alg not in ALLOWED_ALGORITHMS or not isinstance(kid, str) or not kid:
            # e.g. HS256: the project still signs with the legacy shared secret.
            logger.info("bearer token rejected: alg %s not allowed", alg)
            raise _invalid()
        key = self._key_for(kid)
        if key is None:
            # Usual cause: the web app signs in against a different Supabase project
            # than SUPABASE_URL here, so its key id is not in this JWKS.
            logger.warning(
                "bearer token rejected: key id not in JWKS of %s "
                "(check that SUPABASE_URL matches NEXT_PUBLIC_SUPABASE_URL)",
                self.issuer,
            )
            raise _invalid()
        # The key's own algorithm must match the header (no algorithm confusion).
        if key.algorithm_name != alg:
            logger.info("bearer token rejected: key/alg mismatch")
            raise _invalid()
        try:
            claims = jwt.decode(
                token,
                key=key.key,
                algorithms=[alg],
                audience=self.audience,
                issuer=self.issuer,
                leeway=LEEWAY_S,
                options={"require": ["exp", "sub", "iss", "aud"]},
            )
        except jwt.PyJWTError as exc:
            logger.info("bearer token rejected: %s", type(exc).__name__)
            raise _invalid() from None
        sub = claims.get("sub")
        try:
            user_id = str(uuid.UUID(str(sub)))
        except ValueError:
            raise _invalid() from None
        self._first_seen(user_id)
        return user_id

    def _first_seen(self, user_id: str) -> None:
        if self._on_first_seen is None or user_id in self._seen:
            return
        try:
            self._on_first_seen(user_id)
            self._seen.add(user_id)
        except Exception as exc:  # noqa: BLE001 - profile upsert is best effort; retried later
            logger.warning("profile upsert failed: %s", type(exc).__name__)


def _ensure_profile_in_db(user_id: str) -> None:
    # Lazy import: tests that override get_verifier never touch the database.
    from avp_api.services import profile_service

    profile_service.ensure_profile_in_db(user_id)


_VERIFIERS: dict[tuple[str, str, float], SupabaseJwtVerifier] = {}
_VERIFIERS_LOCK = threading.Lock()


def get_verifier() -> TokenVerifier:
    settings = get_settings()
    if not settings.supabase_url:
        return UnconfiguredVerifier()
    key = (settings.supabase_url, settings.supabase_jwt_audience, settings.jwks_cache_ttl_s)
    with _VERIFIERS_LOCK:
        verifier = _VERIFIERS.get(key)
        if verifier is None:  # one instance per config, so the JWKS cache is shared
            verifier = SupabaseJwtVerifier(
                key[0], key[1], key[2], on_first_seen=_ensure_profile_in_db
            )
            _VERIFIERS[key] = verifier
        return verifier


def current_user_id(
    authorization: str | None = Header(default=None),
    verifier: TokenVerifier = Depends(get_verifier),
) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "INVALID_AUTH_HEADER",
                "message": "Expected 'Authorization: Bearer <token>'.",
            },
        )
    return verifier.verify(token.strip())


def require_user_id(user_id: str | None = Depends(current_user_id)) -> str:
    """For routes that need a signed-in user: a guest gets 401 AUTH_REQUIRED."""
    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "AUTH_REQUIRED", "message": "Sign in to use this feature."},
        )
    return user_id
