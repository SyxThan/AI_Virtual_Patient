# ADR-0007: Supabase Postgres; all access via FastAPI; RLS on every table

- Status: Accepted
- Date: 2026-11-09
- Deciders: Team TRINITY (human), Claude Code
- Related: AVP-005; CLAUDE.md "Architecture", "Hard rules" 6-8; docs/specs/database.md

## Context
Student transcripts are personal data. The browser must not reach the database
directly, authorization must be enforced server-side, and schema changes must be
reviewable. The team uses Supabase for managed Postgres, Auth and pgvector.

## Decision
We will use **Supabase as managed Postgres only**: all business logic and data
access go through **FastAPI**; the browser never queries the database directly.
**Every table has Row Level Security enabled with no `anon`/`authenticated`
grants**; `make db-check-rls` must pass before a table is considered done.
Authorization (a user sees only their own sessions) is enforced in FastAPI and
tested. **Schema changes only through hand-reviewed Alembic migrations** — never
edit tables in the Supabase dashboard, never migrate the demo project without the
human's OK.

## Consequences
- One defended boundary (FastAPI) instead of trusting the client.
- RLS is defence in depth even though the app connects as a privileged role.
- A new table is not "done" until its RLS check passes.

## Alternatives considered
- Browser → Supabase via `supabase-js` with RLS policies: rejected — business
  logic and guardrails would leak to the client; the voice loop still needs the API.
- Supabase service-role key in the browser: rejected — never; it bypasses RLS.
