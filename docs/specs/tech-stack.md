# Tech stack and conventions

Decided by the human: FastAPI, Next.js, PostgreSQL on Supabase. Everything else here is a default that can change with the human's OK. Do not pin versions in this file; pin them in `pyproject.toml` / `package.json` when AVP-006 scaffolds the repo.

## Components
| Part | Choice | Role |
|---|---|---|
| Backend | FastAPI, Pydantic v2, SQLAlchemy 2 (psycopg 3), Alembic, pytest, ruff | REST + WebSocket, agents, guardrails, jobs |
| Frontend | Next.js App Router, TypeScript strict, Tailwind, Vitest, Playwright | UI only |
| Database | PostgreSQL on Supabase, pgvector | See database.md |
| Auth | Supabase Auth; FastAPI verifies the JWT | Browser uses `supabase-js` for sign-in only |
| LLM / STT / TTS | Behind provider adapters in `apps/api/avp_api/providers/` | Model ids and keys from env |
| Avatar | Three.js in a client-only component | Loaded with `dynamic(..., { ssr: false })` |
| Hosting | Not decided | Web on a Next.js host; API on a container host that supports long-lived WebSockets |

Why the API is a separate service: the voice loop needs a long-lived WebSocket and background work, which serverless Next.js route handlers do not provide. So Next.js renders the UI and FastAPI owns everything else.

## Repo layout
```
apps/api/avp_api/
  main.py  config.py            # app factory, pydantic-settings from env
  routers/                      # HTTP + WS endpoints, thin
  services/                     # patient, evaluator, debrief, scenario, session, evaluation, retrieval; labs and vitals in Layer 2
  providers/                    # llm, stt, tts adapters + fakes for tests
  db/ (models.py, session.py, repositories/)   # the only place SQL lives
  jobs/                         # worker loop over the jobs table
apps/api/alembic/  apps/api/tests/
apps/web/src/app/               # routes: setup, session/[id], debrief/[id]
apps/web/src/components/  apps/web/src/lib/api-client/   # generated
apps/web/messages/vi.json
data/cases/  data/source/       # source/ is git-ignored
schemas/  evals/  docs/  scripts/  .agy/
```

## Environment variables
Backend (`apps/api`, read via pydantic-settings; never `NEXT_PUBLIC_`):
| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Supabase pooler, session mode, `postgresql+psycopg://...` |
| `SUPABASE_URL` | For JWT verification (JWKS) |
| `ALLOWED_ORIGINS` | CORS origins for the web app, comma-separated |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL_PATIENT`, `LLM_MODEL_EVALUATOR` | LLM adapter |
| `EMBEDDING_MODEL` | Fixed in AVP-018; changing it means re-embedding |
| `STT_PROVIDER`, `STT_API_KEY`, `TTS_PROVIDER` (`google` \| `vieneu`), `TTS_API_KEY`, `TTS_BASE_URL`, `TTS_VOICE_ID` | Voice adapters (`vieneu` = self-hosted VieNeu-TTS server, Slice 16) |

Frontend (`apps/web`; these are public by design, so no secrets):
| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` | FastAPI base URLs |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser Supabase client (auth only). The key is the public one (called anon key in older projects). |

A Supabase secret/service-role key is not needed by default; see database.md.

## API and WebSocket conventions
- REST under `/api/v1`, JSON, response models on every route; the OpenAPI schema is the contract and `make gen-client` regenerates the typed client for the web app.
- Auth: `Authorization: Bearer <supabase access token>`. For WebSocket, send the token as the first message after connecting, not in the URL (URLs end up in logs).
- Errors: one JSON shape `{ "error": { "code": "...", "message": "..." } }`; never return stack traces or raw provider errors.
- Core endpoints (sketch, to be fixed in AVP-005): `POST /sessions` (case id, mode, consent), `GET /sessions/{id}`, `POST /sessions/{id}/turns`, `POST /sessions/{id}/finish`, `GET /sessions/{id}/evaluation`, `GET /sessions/{id}/debrief`, `GET /sessions` (history; guest sessions send an unguessable token header); exam/lab actions arrive in Layer 2; WS `/ws/sessions/{id}` for the voice/text turn loop.
- Hot path: one cached system prompt per case, no RAG, no blocking DB write before audio starts. The cold path runs as `jobs` rows processed by a worker.
- Rate-limit and size-limit audio and text input; reject sessions that were not created by the caller.

## Local development
- `make dev` starts API and web against the `avp-dev` Supabase project, or a local Postgres if `DATABASE_URL` points to one.
- Tests use fake providers and synthetic data; no real API keys and no network in unit tests.
- Windows: use WSL2 or Git Bash for the Makefile and scripts, or provide equivalent npm/uv scripts in AVP-006.
