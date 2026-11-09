-- Reference DDL for AVP (PostgreSQL 15+ on Supabase).
-- Alembic migrations (task AVP-007) become authoritative; keep this file in sync or delete it then.
-- All tables live in `public`. RLS is enabled and anon/authenticated are revoked at the end:
-- the app reaches data only through FastAPI (see docs/specs/database.md).

create extension if not exists vector;  -- pgvector; on Supabase you can also enable it under Database > Extensions

create table profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role         text not null default 'student' check (role in ('student', 'instructor', 'admin')),
  created_at   timestamptz not null default now()
);

-- Loaded snapshot of data/cases/*.json (the JSON files are the source of truth).
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
  user_id      uuid references auth.users (id) on delete cascade,  -- null = guest session
  guest_token_hash text,                          -- sha256 of an unguessable token; set iff user_id is null
  check ((user_id is null) = (guest_token_hash is not null)),
  case_id      text not null,
  case_version integer not null,
  mode         text not null default 'exam' check (mode in ('guided', 'exam')),
  status       text not null default 'active'
               check (status in ('active', 'completed', 'abandoned', 'evaluating', 'evaluated', 'failed')),
  consented_at timestamptz,                      -- required before a session is used for evaluation or research
  state        jsonb not null default '{}'::jsonb, -- improvised_facts (Layer 2: vitals, orders); checkpointed, not per turn
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
  t_start_ms     integer not null check (t_start_ms >= 0),  -- offset from session start; evidence timestamps use this
  t_end_ms       integer check (t_end_ms is null or t_end_ms >= t_start_ms),
  first_audio_ms integer,                                   -- end of student speech to first patient audio (latency metric)
  guardrail      jsonb,                                     -- failed checks, regenerations, tier-3 hit
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

-- One row per rubric criterion. Evidence rule enforced here: met/partial need verified evidence.
create table evaluation_items (
  id            bigint generated always as identity primary key,
  evaluation_id uuid not null references evaluations (id) on delete cascade,
  criterion_id  text not null,                       -- r-* id from the case rubric
  level         smallint check (level in (0, 1, 2)), -- null = insufficient evidence
  status        text not null check (status in ('met', 'partial', 'unmet', 'insufficient_evidence')),
  evidence      jsonb not null default '[]'::jsonb,  -- [{turn_idx, quote}], verified by code
  feedback      text,
  flagged       boolean not null default false,      -- verifier downgraded the LLM's claim
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
  content       jsonb not null,                      -- every claim lists the source_chunks ids it relies on
  created_at    timestamptz not null default now()
);

create table source_documents (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  publisher      text,
  year           integer,
  license_note   text,
  rights_checked boolean not null default false,     -- ingest only when true
  created_at     timestamptz not null default now()
);

create table source_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references source_documents (id) on delete cascade,
  section     text,
  chunk_index integer not null,
  text        text not null,
  embedding   vector(768),  -- PLACEHOLDER: the dimension is fixed by the embedding model chosen in AVP-018
  unique (document_id, chunk_index)
);
-- Vector index (hnsw or ivfflat) is added in AVP-018, after the embedding model is chosen (AVP-018).

-- Postgres-backed job queue for the cold path. Workers claim with:
--   select ... from jobs where status = 'queued' and run_after <= now()
--   order by run_after for update skip locked limit 1;
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

-- Tier-3 guardrail hits: authors review these and promote frequent ones into the case JSON.
create table fallback_hits (
  id         bigint generated always as identity primary key,
  session_id uuid references sessions (id) on delete cascade,
  case_id    text not null,
  kind       text not null check (kind in ('unknown_symptom', 'not_ordered_lab', 'out_of_scope')),  -- unknown_symptom = unknown-policy line used
  question   text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Security: deny the Supabase Data API (anon / authenticated) everything. FastAPI connects with
-- the database role from DATABASE_URL, not through the Data API.
-- 'alembic_version' exists by the time the first migration runs, so it is included.
do $$
declare t text;
begin
  for t in select unnest(array[
    'alembic_version', 'profiles', 'cases', 'sessions', 'turns', 'evaluations', 'evaluation_items', 'debriefs',
    'source_documents', 'source_chunks', 'jobs', 'fallback_hits'])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on all sequences in schema public from anon, authenticated;
-- Future tables created by migrations (run as the postgres role) start without those grants.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
