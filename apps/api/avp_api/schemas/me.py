"""Profile (/me) and guest-claim schemas (Slice 10, AVP-108).

The email is never returned or stored here: it stays in Supabase Auth.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

DISPLAY_NAME_MAX = 80


class MeResponse(BaseModel):
    user_id: str
    display_name: str | None
    role: str
    created_at: datetime


class MeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Stripped; empty clears the name. Longer than 80 characters -> 422.
    display_name: str | None

    @field_validator("display_name")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = " ".join(v.split())  # strip and collapse whitespace (incl. newlines)
        if len(v) > DISPLAY_NAME_MAX:
            raise ValueError(f"display_name must be at most {DISPLAY_NAME_MAX} characters")
        return v or None


class ClaimResponse(BaseModel):
    session_id: str
    # "claimed" the first time, "already_owned" on a repeat (idempotent).
    status: Literal["claimed", "already_owned"]
