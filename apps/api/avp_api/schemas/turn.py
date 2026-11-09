"""Turn (transcript) API schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class TurnCreate(BaseModel):
    text: str


class TurnResponse(BaseModel):
    turn_idx: int
    speaker: str  # "student" | "patient"
    text: str
    created_at: datetime
