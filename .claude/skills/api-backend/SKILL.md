---
name: api-backend
description: Use when adding or changing FastAPI endpoints, Pydantic models, SQLAlchemy data access, Alembic migrations, RLS, or the jobs worker in apps/api.
---

# API backend (FastAPI)

The API owns all business logic and data access (ADR-0001, ADR-0007). Routers are
thin; logic lives in `services/`; SQL lives only in `db/`.

## Endpoint conventions (ADR-0011; contract in docs/specs/openapi.yaml)
- REST under `/api/v1`, JSON, a `response_model` on every route.
- Error shape is uniform: `{"error": {"code": "...", "message": "..."}}`. The app factory in `avp_api/main.py` already registers handlers for `StarletteHTTPException` and validation errors — raise `HTTPException(status_code=..., detail="snake_case_code")`, never return raw provider errors or stack traces.
- Auth: `Authorization: Bearer <supabase JWT>`, verified via JWKS (ADR-0008). WebSocket token is the first message, never in the URL. Guest sessions use an unguessable `X-Guest-Token`; every session route checks ownership (T-SEC-01).
- Rate-limit and size-limit text/audio input.

## Patterns
- Config: add fields to `Settings` in `avp_api/config.py` (pydantic-settings, env-driven). Never hard-code secrets/model ids.
- New router: create `avp_api/routers/<name>.py` with `APIRouter(tags=[...])`, include it in `create_app()` under `settings.api_prefix`. Keep it thin; call a service.
- Data access: SQLAlchemy 2 style (`select()`, `Session`), one repository per aggregate in `avp_api/db/repositories/`. No SQL outside `db/`.

## Migrations (AVP-007; ADR-0007)
- Schema changes ONLY through hand-reviewed Alembic migrations — never edit tables in the Supabase dashboard.
- Every new table: enable RLS, revoke `anon`/`authenticated` grants; a table is not done until `make db-check-rls` returns zero rows. Migration commits use scope `db` and state RLS+revokes are included.

## Jobs (ADR-0004; AVP-014)
- Cold-path work (evaluate, debrief) is enqueued as `jobs` rows and drained by a worker loop in `avp_api/jobs/` using `SELECT ... FOR UPDATE SKIP LOCKED` (two workers process each job once).

## Hot path (ADR-0002)
- During the interview: one cached system prompt per case, no RAG, no blocking DB write before the reply. Keep the Patient turn endpoint off the DB critical path.

## Testing
- `pytest` with fake providers and synthetic data; no network, no real keys. Pattern in `tests/test_health.py` (TestClient + app factory). Put provider fakes in `avp_api/providers/`.
- Run: `cd apps/api; python -m pytest -q; python -m ruff check .`.
