"""Guided-vs-exam session guide schemas (Slice 12, AVP-112 / TASK-S12-03).

The guided checklist reuses the case rubric wording verbatim (domain id and
criterion title). No new clinical text is written here, and the wording stays
labelled `draft` until a clinician reviews it (CLAUDE.md Hard rule 2).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class GuideItem(BaseModel):
    criterion_id: str = Field(description="Rubric criterion id from the case JSON.")
    domain: str = Field(description="Rubric domain id, e.g. 'history'.")
    title: str = Field(description="Rubric criterion title, verbatim from the case JSON.")


class GuideResponse(BaseModel):
    session_id: str
    mode: str
    # True only in guided mode. In exam mode `items` is always empty (hidden server-side).
    checklist_enabled: bool
    items: list[GuideItem]
    rubric_version: int | None = None
    review_status: Literal["draft"] = "draft"
    notice: str
    # Exam-mode limit in seconds (config EXAM_TIME_LIMIT_S); None = no limit.
    time_limit_s: int | None = None
    started_at: datetime
    # Server clock, so the client countdown is not skewed by a wrong local clock.
    server_now: datetime
    deadline_at: datetime | None = None
    time_limit_reached: bool = False
