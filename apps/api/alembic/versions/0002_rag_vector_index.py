"""RAG corpus: ingest metadata + HNSW cosine index on source_chunks.embedding

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-11

Slice 8 (AVP-017/018). No new table, so the RLS/REVOKE baseline from 0001 still
covers source_documents and source_chunks (re-asserted below anyway, idempotent).

- source_documents.source_key: stable key so `scripts/ingest_guidelines.py` is
  idempotent; review_status mirrors cases (draft until a clinician signs off);
  content_hash: skip re-embedding unchanged documents.
- source_chunks.embedding_model: retrieval only compares vectors produced by the
  same model (changing EMBEDDING_MODEL means re-ingesting, never mixing spaces).
- HNSW index with vector_cosine_ops for `embedding <=> :query` ordering.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UP = [
    "alter table source_documents add column source_key text",
    "alter table source_documents add constraint source_documents_source_key_key unique (source_key)",
    "alter table source_documents add column review_status text not null default 'draft'",
    "alter table source_documents add constraint source_documents_review_status_check "
    "check (review_status in ('draft', 'clinician_reviewed'))",
    "alter table source_documents add column content_hash text",
    "alter table source_chunks add column embedding_model text",
    "create index source_chunks_embedding_hnsw_idx on source_chunks "
    "using hnsw (embedding vector_cosine_ops)",
]

_DOWN = [
    "drop index if exists source_chunks_embedding_hnsw_idx",
    "alter table source_chunks drop column if exists embedding_model",
    "alter table source_documents drop column if exists content_hash",
    "alter table source_documents drop constraint if exists source_documents_review_status_check",
    "alter table source_documents drop column if exists review_status",
    "alter table source_documents drop constraint if exists source_documents_source_key_key",
    "alter table source_documents drop column if exists source_key",
]


def upgrade() -> None:
    bind = op.get_bind()
    for statement in _UP:
        bind.exec_driver_sql(statement)
    for table in ("source_documents", "source_chunks"):
        bind.exec_driver_sql(f'alter table public."{table}" enable row level security')
        bind.exec_driver_sql(f'revoke all on table public."{table}" from anon, authenticated')


def downgrade() -> None:
    bind = op.get_bind()
    for statement in _DOWN:
        bind.exec_driver_sql(statement)
