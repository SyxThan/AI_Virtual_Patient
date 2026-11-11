"""Evaluation schemas (Slice 7, AVP-013/014). docs/specs/evaluation.md.

Two halves: what the Evaluator LLM may *propose* (EvaluatorLLMOutput), and what
the API returns after code has verified the evidence and computed the score.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

CriterionStatus = Literal["met", "partial", "unmet", "insufficient_evidence"]

PRACTICE_NOTICE = (
    "Học liệu phản hồi để luyện tập, không phải kết quả đánh giá chính thức hay chứng chỉ."
)


# --- LLM proposal (validated, never trusted) ------------------------------------


class EvidenceItem(BaseModel):
    turn_idx: int
    quote: str


class ProposedCriterion(BaseModel):
    criterion_id: str
    level: Literal[0, 1, 2] | None = None
    evidence: list[EvidenceItem] = Field(default_factory=list)
    feedback: str = ""


class EvaluatorLLMOutput(BaseModel):
    items: list[ProposedCriterion]


# --- After deterministic verification ---------------------------------------------


class VerifiedCriterion(BaseModel):
    criterion_id: str
    level: Literal[0, 1, 2] | None
    status: CriterionStatus
    evidence: list[EvidenceItem]
    feedback: str
    flagged: bool  # the verifier downgraded the LLM's claim


class ScoringResult(BaseModel):
    total_score: float
    critical_missed: bool
    scoring_version: str


# --- API ---------------------------------------------------------------------------


class CriterionResultResponse(BaseModel):
    criterion_id: str
    criterion: str
    domain: str | None = None
    weight: float
    critical: bool
    level: int | None
    status: CriterionStatus
    score: float  # level / 2, 0 for insufficient evidence
    evidence: list[EvidenceItem]
    feedback: str | None
    flagged: bool
    low_reliability: bool = False


class EvaluationResponse(BaseModel):
    status: Literal["pending", "done", "failed"]
    session_id: str
    evaluation_id: str | None = None
    rubric_version: int | None = None
    scoring_version: str | None = None
    model: str | None = None
    prompt_version: str | None = None
    total_score: float | None = None
    max_score: float = 100.0
    critical_missed: bool = False
    criteria: list[CriterionResultResponse] = Field(default_factory=list)
    error: str | None = None
    created_at: datetime | None = None
    practice_feedback_only: bool = True
    notice: str = PRACTICE_NOTICE
