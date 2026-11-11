"""Debrief I/O (Slice 8, AVP-019). docs/specs/agents-and-rag.md section 2.3/3.

Citation contract (T-RAG-01/02): a claim is `verified` only when it carries at
least one citation that resolved to a real retrieved chunk; its citation fields
are copied from the database, never from LLM text. Otherwise `verified=false`
and `citations=[]` ("no suitable source").
"""

from __future__ import annotations

import datetime
from typing import Literal

from pydantic import BaseModel, Field

DEBRIEF_NOTICE = (
    "Học liệu phản hồi để luyện tập, không thay thế giảng viên và không phải chứng chỉ. "
    "Chỉ các nhận xét có trích dẫn mới được đối chiếu với tài liệu hướng dẫn; "
    "tài liệu nguồn hiện là bản tóm tắt nháp, chưa được bác sĩ duyệt."
)


class CitationItem(BaseModel):
    source_id: str  # stable document key, e.g. "moh-qd-1003-2012"
    chunk_id: str
    document_title: str
    publisher: str | None = None
    year: int | None = None
    section: str
    quote_excerpt: str
    review_status: Literal["draft", "clinician_reviewed"]


class DebriefClaimItem(BaseModel):
    text: str
    criterion_id: str | None = None
    verified: bool
    citations: list[CitationItem] = Field(default_factory=list)


class PedagogicalSummary(BaseModel):
    """The 5-tier feedback frame."""

    expected_approach: str
    rationale: str
    learning_points: list[str] = Field(default_factory=list)
    acceptable_alternatives: str
    important_errors: list[str] = Field(default_factory=list)


class DebriefResponse(BaseModel):
    status: Literal["pending", "done", "failed"]
    session_id: str
    id: str | None = None
    evaluation_id: str | None = None
    summary: PedagogicalSummary | None = None
    items: list[DebriefClaimItem] = Field(default_factory=list)
    critical_missed: bool | None = None
    model: str | None = None
    prompt_version: str | None = None
    embedding_model: str | None = None
    # False while any cited source is still a draft summary (Hard Rule 2).
    sources_reviewed: bool = False
    error: str | None = None
    created_at: datetime.datetime | None = None
    practice_feedback_only: bool = True
    notice: str = DEBRIEF_NOTICE


# --- LLM structured output (validated; never trusted for citation metadata) ----


class LLMClaim(BaseModel):
    text: str = Field(min_length=1)
    criterion_id: str | None = None
    source_ids: list[str] = Field(default_factory=list)


class DebriefLLMOutput(BaseModel):
    summary: PedagogicalSummary
    items: list[LLMClaim] = Field(default_factory=list)
