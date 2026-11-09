# Worker rules (for agy)

You are a worker agent. Claude Code (the lead) gives you one task brief at a time in `.agy/tasks/AVP-xxx.md`. Do exactly that task, nothing else.

## Scope
- Read the brief and only the files it lists under Context. Do not explore the repo.
- Create or edit only paths listed under `## Allowed paths`. Touching anything else fails the task automatically.
- Git: you may read state (`git status`, `git diff`, `git log`). Never run a command that changes it (commit, add, checkout, switch, reset, stash, merge, rebase, push, branch, config). You work on the branch you were started on; the lead commits and pushes.
- Do not install global tools, or change `.env`, `CLAUDE.md`, `AGENTS.md`, `schemas/` or `docs/` unless the brief allows it.
- Never read, print or write secrets. Do not call external APIs; use fakes/mocks in tests.

## Medical content
- Never write or invent clinical content: symptoms, vitals, lab values, doses, diagnoses, patient dialogue. If the task seems to need it, stop and say so in the report.
- Case data comes only from `data/cases/*.json`. Do not "fix" clinical values you think are wrong; report them.

## Code conventions
- Backend: Python 3.11+, type hints, Pydantic v2, FastAPI, SQLAlchemy 2 (psycopg 3), pytest, ruff. SQL only inside `apps/api/avp_api/db/repositories/`; routers call services, services call repositories.
- Frontend: Next.js App Router, TypeScript strict, React function components, Tailwind. Mark components that need browser APIs (audio, WebGL) with `"use client"`. Call the backend only through the generated client in `apps/web/src/lib/api-client`; never query the database or Supabase tables from the browser.
- Never create or edit Alembic migrations, RLS or grants, or auth code unless the brief explicitly allows it.
- Small pure functions, no hidden global state, no new dependency unless the brief names it.
- Every new module gets tests. Tests use synthetic data only.
- Identifiers and comments in English; user-visible Vietnamese text goes in `apps/web/messages/vi.json`.

## Finish
1. Run the brief's acceptance command and fix failures within the allowed paths.
2. Write `.agy/reports/AVP-xxx.md` with exactly these headings, each at most 8 lines:
   `## Summary` · `## Files changed` · `## How verified` · `## Blockers / questions`
3. If blocked or the brief is ambiguous, stop and write the question under Blockers instead of guessing.
