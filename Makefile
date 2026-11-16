# AVP developer commands (CLAUDE.md "Commands"). GNU make.
# Recipes use '>' as the prefix (.RECIPEPREFIX) to avoid tab pitfalls.
# Windows without make: see README.md for the equivalent native commands.
.RECIPEPREFIX = >
.DEFAULT_GOAL := help

API_DIR := apps/api
WEB_DIR := apps/web

.PHONY: help dev test lint validate-cases db-migrate db-check-rls load-cases gen-client check-llm redteam eval-latency eval-repeatability

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
> @echo "  check-llm      diagnose the configured LLM provider"
> @echo "  redteam        run the Patient red-team suite -> evals/results (AVP-011)"
> @echo "  eval-latency   measure turn latency -> evals/results    (AVP-026)"
> @echo "  eval-repeatability  re-score fixed transcripts K times  (AVP-117)"

dev:
> cd $(API_DIR) && python -m uvicorn avp_api.main:app --reload --port 8000 & \
> cd $(WEB_DIR) && npm run dev

test:
> cd $(API_DIR) && python -m pytest -q

lint:
> cd $(API_DIR) && python -m ruff check .
> cd $(WEB_DIR) && npm run lint

validate-cases:
> python scripts/validate_cases.py

gen-client:
> cd $(WEB_DIR) && npm run gen-client

check-llm:
> python scripts/check_llm.py

# Fake providers by default; real numbers: make eval-latency ARGS="--providers env --mode voice"
eval-latency:
> python evals/latency.py $(ARGS)

eval-repeatability:
> python evals/repeatability.py $(ARGS)

db-migrate:
> cd $(API_DIR) && python -m alembic upgrade head

db-check-rls:
> python scripts/check_rls.py

# --- Targets implemented by later tasks. Fail loudly (no false success). ---

load-cases:
> python scripts/load_cases.py

redteam:
> python evals/redteam.py $(ARGS)
