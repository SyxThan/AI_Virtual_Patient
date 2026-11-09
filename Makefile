# AVP developer commands (CLAUDE.md "Commands"). GNU make.
# Recipes use '>' as the prefix (.RECIPEPREFIX) to avoid tab pitfalls.
# Windows without make: see README.md for the equivalent native commands.
.RECIPEPREFIX = >
.DEFAULT_GOAL := help

API_DIR := apps/api
WEB_DIR := apps/web

.PHONY: help dev test lint validate-cases db-migrate db-check-rls load-cases gen-client redteam

help:
> @echo "AVP make targets:"
> @echo "  dev            start API and web for local development"
> @echo "  test           run backend tests"
> @echo "  lint           run backend (ruff) and web (eslint) linters"
> @echo "  validate-cases validate data/cases against the schema   (AVP-035)"
> @echo "  db-migrate     apply Alembic migrations                 (AVP-007)"
> @echo "  db-check-rls   assert RLS on every table                (AVP-007)"
> @echo "  load-cases     load cases into the database             (AVP-008)"
> @echo "  gen-client     regenerate the TS client from OpenAPI    (AVP-035)"
> @echo "  redteam        run the red-team suite                   (AVP-011)"

dev:
> cd $(API_DIR) && python -m uvicorn avp_api.main:app --reload --port 8000 & \
> cd $(WEB_DIR) && npm run dev

test:
> cd $(API_DIR) && python -m pytest -q

lint:
> cd $(API_DIR) && python -m ruff check .
> cd $(WEB_DIR) && npm run lint

# --- Targets implemented by later tasks. Fail loudly (no false success). ---
validate-cases:
> @echo "validate-cases: not implemented yet - see task AVP-035"; exit 1

db-migrate:
> @echo "db-migrate: not implemented yet - see task AVP-007"; exit 1

db-check-rls:
> @echo "db-check-rls: not implemented yet - see task AVP-007"; exit 1

load-cases:
> @echo "load-cases: not implemented yet - see task AVP-008"; exit 1

gen-client:
> @echo "gen-client: not implemented yet - see task AVP-035"; exit 1

redteam:
> @echo "redteam: not implemented yet - see task AVP-011"; exit 1
