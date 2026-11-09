"""initial schema: 11 tables + RLS/REVOKE baseline

Revision ID: 0001
Revises:
Create Date: 2026-11-09

Mirrors docs/specs/schema.sql exactly (this migration is authoritative). All
tables live in `public`; RLS is enabled and anon/authenticated are revoked so the
app reaches data only through FastAPI (ADR-0007). Requires the Supabase `auth`
schema (auth.users) and the `anon`/`authenticated` roles to exist.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SCHEMA_SQL = r"""
create extension if not exists vector;

create table profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role         text not null default 'student' check (role in ('student', 'instructor', 'admin')),
  created_at   timestamptz not null default now()
);

create table cases (
  id            text not null,
  version       integer not null,
  content       jsonb not null,
  content_hash  text not null,
  review_status text not null default 'draft' check (review_status in ('draft', 'clinician_reviewed')),
  reviewer      text,
  reviewed_at   date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  primary key (id, version),
  check (review_status = 'draft' or (reviewer is not null and reviewed_at is not null))
);
create unique index cases_one_active_idx on cases (id) where is_active;

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete cascade,
  guest_token_hash text,
  check ((user_id is null) = (guest_token_hash is not null)),
  case_id      text not null,
  case_version integer not null,
  mode         text not null default 'exam' check (mode in ('guided', 'exam')),
  status       text not null default 'active'
               check (status in ('active', 'completed', 'abandoned', 'evaluating', 'evaluated', 'failed')),
  consented_at timestamptz,
  state        jsonb not null default '{}'::jsonb,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  foreign key (case_id, case_version) references cases (id, version)
);
create index sessions_user_idx on sessions (user_id, started_at desc);

create table turns (
  id             bigint generated always as identity primary key,
  session_id     uuid not null references sessions (id) on delete cascade,
  idx            integer not null,
  speaker        text not null check (speaker in ('student', 'patient', 'system')),
  text           text not null,
  t_start_ms     integer not null check (t_start_ms >= 0),
  t_end_ms       integer check (t_end_ms is null or t_end_ms >= t_start_ms),
  first_audio_ms integer,
  guardrail      jsonb,
  created_at     timestamptz not null default now(),
  unique (session_id, idx)
);

create table evaluations (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions (id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  model           text not null,
  prompt_version  text not null,
  rubric_version  integer not null,
  scoring_version text not null,
  total_score     numeric(5, 2) check (total_score between 0 and 100),
  critical_missed boolean not null default false,
  error           text,
  created_at      timestamptz not null default now()
);
create index evaluations_session_idx on evaluations (session_id, created_at desc);

create table evaluation_items (
  id            bigint generated always as identity primary key,
  evaluation_id uuid not null references evaluations (id) on delete cascade,
  criterion_id  text not null,
  level         smallint check (level in (0, 1, 2)),
  status        text not null check (status in ('met', 'partial', 'unmet', 'insufficient_evidence')),
  evidence      jsonb not null default '[]'::jsonb,
  feedback      text,
  flagged       boolean not null default false,
  unique (evaluation_id, criterion_id),
  check ((status = 'met' and level = 2) or (status = 'partial' and level = 1)
         or (status = 'unmet' and level = 0) or (status = 'insufficient_evidence' and level is null)),
  check (status not in ('met', 'partial') or jsonb_array_length(evidence) > 0)
);
create index evaluation_items_eval_idx on evaluation_items (evaluation_id);

create table debriefs (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions (id) on delete cascade,
  evaluation_id uuid not null references evaluations (id) on delete cascade,
  content       jsonb not null,
  created_at    timestamptz not null default now()
);

create table source_documents (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  publisher      text,
  year           integer,
  license_note   text,
  rights_checked boolean not null default false,
  created_at     timestamptz not null default now()
);

create table source_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references source_documents (id) on delete cascade,
  section     text,
  chunk_index integer not null,
  text        text not null,
  embedding   vector(768),
  unique (document_id, chunk_index)
);

create table jobs (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('evaluate', 'debrief')),
  session_id uuid references sessions (id) on delete cascade,
  payload    jsonb not null default '{}'::jsonb,
  status     text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts   integer not null default 0,
  run_after  timestamptz not null default now(),
  locked_at  timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_ready_idx on jobs (run_after) where status = 'queued';

create table fallback_hits (
  id         bigint generated always as identity primary key,
  session_id uuid references sessions (id) on delete cascade,
  case_id    text not null,
  kind       text not null check (kind in ('unknown_symptom', 'not_ordered_lab', 'out_of_scope')),
  question   text not null,
  created_at timestamptz not null default now()
);
"""

# RLS + REVOKE baseline (ADR-0007). Done as explicit statements rather than a
# PL/pgSQL DO block so the psycopg driver does not misread format('%I') as a
# bound parameter. alembic_version is included (it exists by now).
_RLS_TABLES = [
    "alembic_version",
    "profiles",
    "cases",
    "sessions",
    "turns",
    "evaluations",
    "evaluation_items",
    "debriefs",
    "source_documents",
    "source_chunks",
    "jobs",
    "fallback_hits",
]

_TABLES = [
    "fallback_hits",
    "jobs",
    "source_chunks",
    "source_documents",
    "debriefs",
    "evaluation_items",
    "evaluations",
    "turns",
    "sessions",
    "cases",
    "profiles",
]


def _split_statements(sql: str) -> list[str]:
    """Split SQL into statements, honouring $tag$ dollar-quotes and -- line comments."""
    out: list[str] = []
    buf: list[str] = []
    i, n = 0, len(sql)
    dollar: str | None = None
    while i < n:
        if dollar is None:
            if sql.startswith("--", i):
                nl = sql.find("\n", i)
                i = n if nl == -1 else nl
                continue
            m = re.match(r"\$[A-Za-z0-9_]*\$", sql[i:])
            if m:
                tag = m.group(0)
                dollar = tag
                buf.append(tag)
                i += len(tag)
                continue
            ch = sql[i]
            if ch == ";":
                stmt = "".join(buf).strip()
                if stmt:
                    out.append(stmt)
                buf = []
                i += 1
                continue
            buf.append(ch)
            i += 1
        else:
            if sql.startswith(dollar, i):
                buf.append(dollar)
                i += len(dollar)
                dollar = None
                continue
            buf.append(sql[i])
            i += 1
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


def upgrade() -> None:
    bind = op.get_bind()
    for statement in _split_statements(SCHEMA_SQL):
        bind.exec_driver_sql(statement)
    # Enable RLS and revoke the Supabase Data API roles on every table.
    for table in _RLS_TABLES:
        bind.exec_driver_sql(f'alter table public."{table}" enable row level security')
        bind.exec_driver_sql(f'revoke all on table public."{table}" from anon, authenticated')
    bind.exec_driver_sql("revoke all on all sequences in schema public from anon, authenticated")
    bind.exec_driver_sql(
        "alter default privileges for role postgres in schema public "
        "revoke all on tables from anon, authenticated"
    )
    bind.exec_driver_sql(
        "alter default privileges for role postgres in schema public "
        "revoke all on sequences from anon, authenticated"
    )


def downgrade() -> None:
    bind = op.get_bind()
    for table in _TABLES:
        bind.exec_driver_sql(f"drop table if exists public.{table} cascade")
    bind.exec_driver_sql("drop extension if exists vector")
