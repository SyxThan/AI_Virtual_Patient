"""RAG per case: source_documents.case_id (NULL = shared by every case)

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-17

Slice 20 (AVP-151 / TASK-S20-06). The Debriefing Agent retrieves only chunks of
documents that belong to the session's case or are shared (case_id IS NULL), so a
non-HFMD case never cites QĐ 1003.

- Column on source_documents, not source_chunks: a chunk always belongs to one
  document, so scoping the document scopes its chunks (no duplicated data).
- No FK: cases has a composite (id, version) key and a guideline follows the
  case id across case versions.
- Backfill: the two documents ingested so far (data/guidelines/hfmd_moh_chunks.json)
  are HFMD guidelines. Rows that do not exist yet are simply not touched; the
  corpus file now carries case_id so a later ingest writes the same value.
- Idempotent statements (IF NOT EXISTS / IF EXISTS) so a re-run is harmless.
  No new table, so the RLS/REVOKE baseline still applies (re-asserted below).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

HFMD_CASE_ID = "case-01-hfmd"
HFMD_SOURCE_KEYS = ("moh-qd-1003-2012", "htd-hcm-2023-bai20")

_UP = [
    "alter table source_documents add column if not exists case_id text",
    "create index if not exists ix_source_documents_case_id on source_documents (case_id)",
    "update source_documents set case_id = '{case}' "
    "where case_id is null and source_key in ({keys})".format(
        case=HFMD_CASE_ID, keys=", ".join(f"'{k}'" for k in HFMD_SOURCE_KEYS)
    ),
]

_DOWN = [
    "drop index if exists ix_source_documents_case_id",
    "alter table source_documents drop column if exists case_id",
]


def upgrade() -> None:
    bind = op.get_bind()
    for statement in _UP:
        bind.exec_driver_sql(statement)
    bind.exec_driver_sql('alter table public."source_documents" enable row level security')
    bind.exec_driver_sql('revoke all on table public."source_documents" from anon, authenticated')


def downgrade() -> None:
    bind = op.get_bind()
    for statement in _DOWN:
        bind.exec_driver_sql(statement)
