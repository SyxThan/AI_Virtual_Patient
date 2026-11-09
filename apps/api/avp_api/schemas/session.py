"""Session API schemas (Slice 2, AVP-008).

Values align with the database (docs/specs/schema.sql): sessions.mode is
('guided','exam') and status defaults to 'active'. `role` has no column; it is
kept in sessions.state (jsonb) and echoed back here.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# "guided" is the practice/tutorial mode (UI: "Luyện tập"); "exam" is OSCE (UI: "Thi thử").
Mode = Literal["guided", "exam"]
Role = Literal["student", "resident", "practitioner"]


class SessionCreate(BaseModel):
    case_id: str = "case-01-hfmd"
    mode: Mode = "guided"
    role: Role = "student"
    consent: bool


class SessionResponse(BaseModel):
    id: str
    case_id: str
    case_version: int
    mode: str
    role: str
    status: str
    created_at: datetime
    # Returned only for guest sessions; the client stores it and sends it back as X-Guest-Token.
    guest_token: str | None = None
