"""Request authentication (ADR-0008).

Resolves the current user id from a Supabase Bearer JWT, or None for a guest.
The verifier is injectable: tests override it with a fake; full JWKS verification
is finished in a later security task (docs/specs/database.md section 5). A bearer
token is never trusted without verification.
"""

from __future__ import annotations

from typing import Protocol

from fastapi import Depends, Header, HTTPException


class TokenVerifier(Protocol):
    def verify(self, token: str) -> str:
        """Return the user id (JWT `sub`) or raise HTTPException(401)."""
        ...


class UnconfiguredVerifier:
    """Default: refuse bearer tokens until JWT verification is configured."""

    def verify(self, token: str) -> str:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "AUTH_UNAVAILABLE",
                "message": "Token authentication is not configured yet.",
            },
        )


def get_verifier() -> TokenVerifier:
    return UnconfiguredVerifier()


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
    return verifier.verify(token)
