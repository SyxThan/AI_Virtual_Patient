"""Practice-history schemas (Slice 11, AVP-109): GET /sessions and
GET /sessions/progress. Never carries transcript text."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from avp_api.schemas.evaluation import PRACTICE_NOTICE

EvaluationStatus = Literal["none", "pending", "done", "failed"]


class SessionSummary(BaseModel):
    id: str
    case_id: str
    case_title: str | None = None
    mode: str
    status: str
    started_at: datetime
    ended_at: datetime | None = None
    # Only set when the latest evaluation is 'done'; never a partial score.
    total_score: float | None = None
    critical_missed: bool = False
    evaluation_status: EvaluationStatus


class SessionSummaryPage(BaseModel):
    items: list[SessionSummary]
    next_cursor: str | None = None


class ProgressAttempt(BaseModel):
    session_id: str
    started_at: datetime
    total_score: float | None
    critical_missed: bool
    rubric_version: int


class ProgressCriterion(BaseModel):
    criterion_id: str
    criterion: str
    attempts: int
    met: int
    partial: int


class ProgressRubricGroup(BaseModel):
    rubric_version: int
    criteria: list[ProgressCriterion] = Field(default_factory=list)


class ProgressResponse(BaseModel):
    attempts: list[ProgressAttempt] = Field(default_factory=list)
    rubric_groups: list[ProgressRubricGroup] = Field(default_factory=list)
    practice_feedback_only: bool = True
    notice: str = PRACTICE_NOTICE
