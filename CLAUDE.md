# AI Virtual Patient (AVP)

Vietnamese voice-first virtual-patient simulator for medical students. A *Patient Agent* role-plays one fixed clinical case, an *Evaluator Agent* scores the student against an OSCE checklist, a *Debriefing Agent* explains misses with citations. Entry for P-Innovation (team TRINITY, PTIT). Judge-facing docs are Vietnamese; code and agent-facing docs are English (cheaper in tokens).

## Read only what the task needs
| Doing | Read |
|---|---|
| Anything that produces patient replies | docs/specs/guardrails.md, docs/specs/agents-and-rag.md |
| Case data, schema, conversion | docs/specs/case-schema.md, schemas/case.schema.json |
| Stack, repo layout, env vars, API/WebSocket conventions | docs/specs/tech-stack.md, docs/specs/openapi.yaml |
| Database tables, migrations, Supabase connection, RLS | docs/specs/database.md |
| Vitals state machine and clinical grades | docs/specs/vitals-state-machine.md |
| "Is this in the MVP?", priorities, done criteria, claims allowed | docs/specs/product-scope.md |
| Evaluator, scoring, evidence | docs/specs/evaluation.md |
| Tests, release gate | docs/specs/quality-gates.md |
| Risks | docs/risks.md |
| Choosing the next task (Vertical Slices) | docs/TASKS.md, docs/tasks.md |
| Clean-room competitive analysis | docs/research/RECON_cyberpatient.md |
| Starting, committing, pushing, opening a PR | docs/git-workflow.md |
| Delegating to agy | docs/agy-delegation.md |

## Architecture (fixed unless the human changes it)
- **Hot path** (during the interview; target first audio < 1.5 s): only the Patient Agent. The case JSON is compiled into a cached system prompt. **No vector-DB or RAG call per turn.**
- **Cold path** (after the interview, async): Evaluator Agent, then Debriefing Agent (RAG with citations).
- A case is one JSON file in `data/cases/`, validated by `schemas/case.schema.json`. Raw sources in `data/source/` are read-only inputs.
- Stack (decided by the human): **FastAPI** backend (`apps/api`, Pydantic v2, SQLAlchemy 2 + Alembic), **Next.js** frontend (`apps/web`, App Router, TypeScript strict), **PostgreSQL on Supabase**. Other dirs: `data/`, `schemas/`, `evals/`, `docs/`, `scripts/`.
- Supabase is used as managed Postgres (plus pgvector and Auth). **All business logic and all data access go through FastAPI**; the browser never queries the database directly.
- Voice/WebSocket traffic goes browser to FastAPI directly (Next.js route handlers hold no business logic).
- Small-team defaults (change only with the human's OK): Postgres-backed job queue (`jobs` table, no Redis), pgvector for RAG (no separate vector DB), LLM and STT/TTS behind provider adapters, model ids read from env and never hard-coded.

## Hard rules
1. **Medical safety.** The Patient Agent states only facts in the case JSON (tier 1), may improvise only non-medical persona/social detail (tier 2), and otherwise uses the fallback lines (tier 3). Never let an LLM invent symptoms, vitals, lab values or doses. An unlisted clinical fact is **unknown** (neither confirm nor deny), never an invented "no". See docs/specs/guardrails.md.
2. **No unreviewed clinical content presented as verified.** Every case has `review.status`. Clinical text you write or generate stays `draft` / `origin: author_added` until a clinician reviews it. If a clinical fact is missing or the source contradicts itself, leave `TODO(clinician)` and report it; do not guess.
3. **No invented numbers.** Latency, Cohen's kappa, hallucination rate, cost per case, user counts: report only values produced by scripts in `evals/` and saved under `evals/results/`. The proposal's targets (< 1.5 s, kappa >= 0.82) are targets, not results.
4. **Evaluator: LLM proposes, code scores.** Each criterion cites `turn_idx` plus a verbatim student quote; a deterministic verifier checks it; the total is computed by code from the versioned rubric. No evidence means never `met`. Output is practice feedback: never write "certificate" or claim to replace instructors.
5. **Secrets** live in `.env` (see `.env.example`), never in code, logs, task briefs or commits. Only `NEXT_PUBLIC_*` variables may reach the browser, and a Supabase secret/service-role key is never one of them.
6. Student transcripts are personal data: keep them in the database only, honour `consented_at` before using a session for evaluation or research, tests use synthetic transcripts.
7. **Every table has Row Level Security enabled and no `anon`/`authenticated` grants** (the app reaches data only via FastAPI). A new table is not done until `make db-check-rls` passes. Authorization (a user sees only their own sessions) is enforced in FastAPI and tested.
8. **Schema changes only through Alembic migrations**, hand-reviewed. Never edit tables in the Supabase dashboard of the dev or demo project. Never run migrations against the demo project without the human's OK.

## Commands
Created by task AVP-006. Until it is done they do not exist; do not invent others.
`make dev` · `make test` · `make lint` · `make validate-cases` · `make db-migrate` · `make db-check-rls` · `make load-cases` · `make gen-client` · `make redteam`

## Git (details: docs/git-workflow.md)
- **Before any task:** `python scripts/git_task.py preflight AVP-xxx`. Only `READY` (then `start AVP-xxx <slug> [--branch-type docs]`) or `CONTINUE` lets you begin. On `BLOCKED`, stop and tell the human; never stash, reset or discard to get unblocked.
- One task = one branch `<type>/avp-xxx-slug` (type feat|fix|test|docs|chore) = one PR. Never commit or push to `main`; never force-push; never rewrite pushed history.
- Commit with `python scripts/git_task.py commit AVP-xxx -t <type> -s <scope> -m "<summary>"` (subject becomes `type(scope): summary [AVP-xxx]`), then `python scripts/git_task.py push` after every commit. A human squash-merges the PR.
- Never commit secrets, `.env`, `data/source/`, dumps or student data. The script blocks the obvious cases; you are still responsible.

## Scope
The approved MVP (docs/specs/product-scope.md): 1 pediatric Hand, Foot, and Mouth Disease case (mother holding child), 3 core screens (Setup, Clinical Workspace, Debriefing). Includes 3D avatar with raycasting exam, vitals state machine, voice-to-voice communication, Auto-OSCE scoring, cited RAG debrief, and practice-feedback PDF+QR export. Multiple cases, payments, and LMS are excluded. Tasks are mapped to vertical slices in `docs/TASKS.md`.

## Working agreements
- One task = one small, reviewable change. Run `make test` and `make lint` before saying done.
- Ask the human before: changing "Architecture" or "Hard rules", adding a paid service or heavy dependency, or deciding any clinical question.
- Token discipline: never read `data/source/*.docx` or a whole large JSON; query by case id with a script or `jq`. Prefer targeted reads over directory dumps.
- Vietnamese UI strings go in `apps/web/messages/vi.json`; identifiers and comments are English.
- The FastAPI OpenAPI schema is the API contract. After changing an endpoint, run `make gen-client` so the typed client in `apps/web` stays in sync.

## Skills (`.claude/skills/`)
Load the matching skill before working in its area; each is grounded in this repo's real stack and specs (not generic).
- `project-conventions` — stack, layout, naming, build/lint/test, git workflow (read first).
- `frontend-ui` — Next.js App Router, three screens, generated client, vi.json i18n.
- `avatar-3d` — Three.js avatar canvas, mesh colliders, raycasting exam, basic lip-sync.
- `voice-pipeline` — STT/TTS provider adapters, WebSocket audio duplex stream, VAD/buffering.
- `agent-orchestration` — Patient/Evaluator/Debriefing agents, prompt caching, guardrail tiers.
- `vitals-state-machine` — pediatric clinical grades, transition events, monitor display.
- `rag-citation` — pgvector ingest/retrieval, Ministry of Health guideline citation contract.
- `osce-scoring` — rubric, LLM-proposes/code-scores, evidence verifier, PDF+QR export.
- `api-backend` — FastAPI routes, Pydantic v2, SQLAlchemy 2, Alembic, RLS, jobs worker.

## Delegating to agy (Antigravity CLI)
Goal: spend fewer Claude tokens on routine work. Delegate only if **all** hold:
1. The brief fits in ~40 lines and names the files it may touch (about 5 at most).
2. Acceptance is one command that exits 0 on success.
3. None of these is involved: clinical content, Patient/Evaluator/Debriefing prompts, guardrail logic, database schema or migrations, RLS, auth, API-contract decisions, secrets, security.

Procedure:
1. Git first: `preflight`, then `start` (you must be on the task branch with a clean tree).
2. Write `.agy/tasks/AVP-xxx.md` from `.agy/tasks/_TEMPLATE.md`.
3. Run `python scripts/agy_delegate.py AVP-xxx`. It runs agy headless, checks that only allowed paths changed, runs the acceptance command, and prints a short summary.
4. Read only that summary. Open the diff or agy's report only if something failed or the task touched a shared interface.
5. At most 2 retries (tighten the brief each time), then do the task yourself.
6. Never accept agy's own claim of success: the acceptance command and the scope check decide.
7. You commit and push (`git_task.py commit`, `push`). agy never runs state-changing git commands.

Details and known agy quirks: docs/agy-delegation.md.
