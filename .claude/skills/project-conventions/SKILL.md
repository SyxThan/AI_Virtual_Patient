---
name: project-conventions
description: Use when working anywhere in the AVP repo — stack, directory layout, naming, build/lint/test commands, and the git/commit workflow. Read first on any task.
---

# Project conventions (AI Virtual Patient)

Vietnamese voice-first virtual-patient simulator. Judge-facing docs are Vietnamese;
code and agent-facing docs are English. Authoritative rules live in `CLAUDE.md` and
`docs/specs/`; this skill is the quick operational reference.

## Stack (fixed — change only with the human's OK)
- Backend: **FastAPI**, Pydantic v2, SQLAlchemy 2 (psycopg 3), Alembic, pytest, ruff — `apps/api/avp_api/`.
- Frontend: **Next.js 16 App Router**, TypeScript strict, Tailwind v4 — `apps/web/`.
- DB: **PostgreSQL on Supabase** + pgvector. All data access goes through FastAPI (ADR-0007); the browser never queries the DB.
- Job queue: a `jobs` table in Postgres, no Redis (ADR-0004).

## Directory layout
```
apps/api/avp_api/{main,config}.py routers/ services/ providers/ db/ jobs/
apps/web/src/app/{setup,session/[id],debrief/[id]} src/components/ src/lib/api-client/ messages/vi.json
data/cases/  schemas/  evals/  docs/{specs,adr,research}  scripts/
```

## Commands
- `make dev | test | lint` and the stubs `validate-cases db-migrate db-check-rls load-cases gen-client redteam` (see `Makefile`).
- No `make` on Windows: run the equivalents — `cd apps/api; python -m pytest -q; python -m ruff check .` and `cd apps/web; npm run lint; npm run build`.
- The FastAPI OpenAPI schema is the API contract; after changing an endpoint run `make gen-client`.

## Naming
- Python: snake_case modules/functions, PascalCase Pydantic models. TS: camelCase vars, PascalCase components. Vietnamese UI strings only in `apps/web/messages/vi.json`; identifiers/comments in English.
- Case files: `data/cases/<id>.json`, validated by `schemas/case.schema.json`.

## Git (details: docs/git-workflow.md)
- Every task: `python scripts/git_task.py preflight AVP-xxx` → only READY/CONTINUE lets you begin. One task = one branch `<type>/avp-xxx-slug` = one PR; a human squash-merges. Never commit/push to `main`.
- Commit: `python scripts/git_task.py commit AVP-xxx -t <type> -s <scope> -m "..."` then `push`. Subject ≤72 chars.
- **Windows**: prefix git_task.py with `$env:PYTHONUTF8=1` or it crashes decoding UTF-8 (Vietnamese) diffs.
- Never commit `.env`, `data/source/`, secrets, dumps, audio, real transcripts.

## Pitfalls
- Don't hard-code model ids or keys — read from env (ADR-0006).
- Follow the approved MVP scope in `docs/specs/product-scope.md` (1 HFMD case, 3 screens, 3D avatar with raycasting, vitals state machine, voice-to-voice, Auto-OSCE, RAG debrief, practice-report PDF+QR). Do not add payment, LMS, or unreviewed extra cases without authorization.
- Don't present unreviewed clinical content as verified; keep it `draft` / `author_added`.
