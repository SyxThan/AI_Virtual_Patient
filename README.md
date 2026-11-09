# AI Virtual Patient (AVP)

Vietnamese voice-first virtual-patient simulator for medical students. A Patient
Agent role-plays a fixed clinical case, an Evaluator Agent scores the student
against an OSCE checklist, and a Debriefing Agent explains misses with citations.
Entry for P-Innovation (team TRINITY, PTIT).

> Output is **practice feedback**, not an official assessment or certificate
> (ADR-0010). Clinical content is unverified until a clinician reviews it.

## Layout
| Path | What |
|---|---|
| `apps/api` | FastAPI backend: agents, guardrails, sessions, jobs (all business logic) |
| `apps/web` | Next.js frontend (App Router, TypeScript strict): UI only |
| `data/`, `schemas/` | Cases and the case JSON schema |
| `docs/` | Specs, ADRs (`docs/adr/`), API contract (`docs/specs/openapi.yaml`) |
| `evals/`, `scripts/` | Evaluation harness and helper scripts |

Architecture is recorded in `docs/adr/` and `CLAUDE.md`. The API contract is
`docs/specs/openapi.yaml` until `apps/api` generates the live schema.

## Prerequisites
- Python 3.12+
- Node.js 22+ and npm
- (Optional) GNU `make`. On Windows without make, use the native commands below.

## Backend (`apps/api`)
```bash
cd apps/api
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows (PowerShell):
#   .venv\Scripts\Activate.ps1
pip install -e ".[dev]"
python -m pytest -q                 # run tests
python -m uvicorn avp_api.main:app --reload --port 8000
```
Check: open http://localhost:8000/api/v1/health → `{"status":"ok"}`.
Docs (dev): http://localhost:8000/docs.

## Frontend (`apps/web`)
```bash
cd apps/web
npm install
npm run dev                         # http://localhost:3000
```
Set `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` (see `.env.example`) to point at
the API. The browser never queries the database directly (ADR-0007).

## Environment
Copy `.env.example` to `.env` and fill it in. Secrets never go in git. Only
`NEXT_PUBLIC_*` variables reach the browser; a Supabase service-role key is never
one of them.

## Common commands
With `make` (see `Makefile` for all targets):
```bash
make test        # backend tests
make lint        # ruff + eslint
make dev         # start API and web
```
Windows equivalents (no make):
```powershell
# backend
cd apps/api; python -m pytest -q; python -m ruff check .
# web (separate terminal)
cd apps/web; npm run lint; npm run dev
```
`make validate-cases`, `db-migrate`, `db-check-rls`, `load-cases`, `gen-client`
and `redteam` are stubbed until their tasks land (AVP-007/008/011/035).

## Contributing
One task = one branch = one PR; see `docs/git-workflow.md`. Start every task with
`python scripts/git_task.py preflight AVP-xxx`. CI (`.github/workflows/ci.yml`)
runs backend lint+tests and the web lint+build on every PR.
