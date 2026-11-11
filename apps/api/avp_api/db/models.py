"""SQLAlchemy 2 ORM models for the 11 AVP tables (AVP-007).

The Alembic migration (`alembic/versions/0001_initial_schema.py`) is the
authoritative DDL — it mirrors `docs/specs/schema.sql` exactly, including the
RLS/REVOKE baseline and constraints that the ORM cannot express. These models
are the data-access layer (used by `db/repositories/`) and the autogenerate
target; keep them in sync with the migration.
"""

from __future__ import annotations

import datetime
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )


class Profile(Base):
    __tablename__ = "profiles"

    # FK -> auth.users is created by the migration (auth is Supabase's schema,
    # not an ORM-mapped table), so it is not declared here.
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'student'"))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    __table_args__ = (
        CheckConstraint("role in ('student', 'instructor', 'admin')", name="profiles_role_check"),
    )


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    content_hash: Mapped[str] = mapped_column(Text, nullable=False)
    review_status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'draft'"))
    reviewer: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime.date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    __table_args__ = (
        CheckConstraint(
            "review_status in ('draft', 'clinician_reviewed')", name="cases_review_status_check"
        ),
        CheckConstraint(
            "review_status = 'draft' or (reviewer is not null and reviewed_at is not null)",
            name="cases_reviewed_requires_reviewer",
        ),
        Index("cases_one_active_idx", "id", unique=True, postgresql_where=text("is_active")),
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    # FK -> auth.users is created by the migration (Supabase's external schema).
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    guest_token_hash: Mapped[str | None] = mapped_column(Text)
    case_id: Mapped[str] = mapped_column(Text, nullable=False)
    case_version: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'exam'"))
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'active'"))
    consented_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    state: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    started_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    ended_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint(
            "(user_id is null) = (guest_token_hash is not null)", name="sessions_guest_check"
        ),
        CheckConstraint("mode in ('guided', 'exam')", name="sessions_mode_check"),
        CheckConstraint(
            "status in ('active', 'completed', 'abandoned', 'evaluating', 'evaluated', 'failed')",
            name="sessions_status_check",
        ),
        ForeignKeyConstraint(["case_id", "case_version"], ["cases.id", "cases.version"]),
        Index("sessions_user_idx", "user_id", text("started_at desc")),
    )


class Turn(Base):
    __tablename__ = "turns"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    speaker: Mapped[str] = mapped_column(Text, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    t_start_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    t_end_ms: Mapped[int | None] = mapped_column(Integer)
    first_audio_ms: Mapped[int | None] = mapped_column(Integer)
    guardrail: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    __table_args__ = (
        CheckConstraint("speaker in ('student', 'patient', 'system')", name="turns_speaker_check"),
        CheckConstraint("t_start_ms >= 0", name="turns_t_start_check"),
        CheckConstraint("t_end_ms is null or t_end_ms >= t_start_ms", name="turns_t_end_check"),
        UniqueConstraint("session_id", "idx", name="turns_session_idx_key"),
    )


class Evaluation(Base):
    __tablename__ = "evaluations"

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pending'"))
    model: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_version: Mapped[str] = mapped_column(Text, nullable=False)
    rubric_version: Mapped[int] = mapped_column(Integer, nullable=False)
    scoring_version: Mapped[str] = mapped_column(Text, nullable=False)
    total_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    critical_missed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    __table_args__ = (
        CheckConstraint("status in ('pending', 'done', 'failed')", name="evaluations_status_check"),
        CheckConstraint("total_score between 0 and 100", name="evaluations_total_score_check"),
        Index("evaluations_session_idx", "session_id", text("created_at desc")),
    )


class EvaluationItem(Base):
    __tablename__ = "evaluation_items"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    evaluation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evaluations.id", ondelete="CASCADE"), nullable=False
    )
    criterion_id: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[int | None] = mapped_column(SmallInteger)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    feedback: Mapped[str | None] = mapped_column(Text)
    flagged: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    __table_args__ = (
        UniqueConstraint("evaluation_id", "criterion_id", name="evaluation_items_unique"),
        CheckConstraint("level in (0, 1, 2)", name="evaluation_items_level_check"),
        CheckConstraint(
            "status in ('met', 'partial', 'unmet', 'insufficient_evidence')",
            name="evaluation_items_status_check",
        ),
        CheckConstraint(
            "(status = 'met' and level = 2) or (status = 'partial' and level = 1)"
            " or (status = 'unmet' and level = 0)"
            " or (status = 'insufficient_evidence' and level is null)",
            name="evaluation_items_status_level_check",
        ),
        CheckConstraint(
            "status not in ('met', 'partial') or jsonb_array_length(evidence) > 0",
            name="evaluation_items_evidence_required",
        ),
        Index("evaluation_items_eval_idx", "evaluation_id"),
    )


class Debrief(Base):
    __tablename__ = "debriefs"

    id: Mapped[uuid.UUID] = _uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    evaluation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("evaluations.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SourceDocument(Base):
    __tablename__ = "source_documents"

    id: Mapped[uuid.UUID] = _uuid_pk()
    title: Mapped[str] = mapped_column(Text, nullable=False)
    publisher: Mapped[str | None] = mapped_column(Text)
    year: Mapped[int | None] = mapped_column(Integer)
    license_note: Mapped[str | None] = mapped_column(Text)
    rights_checked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # 0002 (AVP-018): stable key for idempotent ingest, clinician review status of
    # the (summarised) text, and a hash of the ingested content + embedding model.
    source_key: Mapped[str | None] = mapped_column(Text, unique=True)
    review_status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'draft'"))
    content_hash: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        CheckConstraint(
            "review_status in ('draft', 'clinician_reviewed')",
            name="source_documents_review_status_check",
        ),
    )


class SourceChunk(Base):
    __tablename__ = "source_chunks"

    id: Mapped[uuid.UUID] = _uuid_pk()
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_documents.id", ondelete="CASCADE"), nullable=False
    )
    section: Mapped[str | None] = mapped_column(Text)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # Dimension is fixed by the embedding model chosen in AVP-018.
    embedding: Mapped[list[float] | None] = mapped_column(Vector(768))
    # 0002: the model that produced `embedding`; retrieval compares same-model vectors only.
    embedding_model: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="source_chunks_unique"),
        Index(
            "source_chunks_embedding_hnsw_idx",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE")
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'queued'"))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    run_after: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    locked_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    __table_args__ = (
        CheckConstraint("kind in ('evaluate', 'debrief')", name="jobs_kind_check"),
        CheckConstraint(
            "status in ('queued', 'running', 'done', 'failed')", name="jobs_status_check"
        ),
        Index("jobs_ready_idx", "run_after", postgresql_where=text("status = 'queued'")),
    )


class FallbackHit(Base):
    __tablename__ = "fallback_hits"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE")
    )
    case_id: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    __table_args__ = (
        CheckConstraint(
            "kind in ('unknown_symptom', 'not_ordered_lab', 'out_of_scope')",
            name="fallback_hits_kind_check",
        ),
    )
