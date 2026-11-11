"""Privacy response schemas (Slice 13, AVP-115)."""

from __future__ import annotations

from pydantic import BaseModel


class DeleteMeResponse(BaseModel):
    """Result of DELETE /me. `account_deleted` is false when the server cannot
    delete the Supabase Auth user (no server-side secret key configured, or the
    Admin API call failed): the login account then still exists and the UI says so."""

    sessions_deleted: int
    profile_deleted: bool
    account_deleted: bool
