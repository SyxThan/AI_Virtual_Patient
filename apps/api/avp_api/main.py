"""FastAPI application factory.

Thin wiring only: settings, CORS, the unified error shape (ADR-0011), and
routers. Business logic lives in services/, data access in db/.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from avp_api.config import get_settings
from avp_api.routers import actions, health, sessions, turns, vitals


def _error_body(code: str, message: str) -> dict:
    # One error shape for every failure (ADR-0011); never leak stack traces.
    return {"error": {"code": code, "message": message}}


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_: Request, exc: StarletteHTTPException):
        # Covers both FastAPI and Starlette HTTPExceptions (incl. unmatched 404s).
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail:
            code = str(detail["code"])
            message = str(detail.get("message", code))
        elif isinstance(detail, str):
            message = detail
            code = message.lower().replace(" ", "_")
        else:
            code, message = "http_error", "HTTP error"
        return JSONResponse(status_code=exc.status_code, content=_error_body(code, message))

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content=_error_body("validation_error", "Request validation failed."),
        )

    app.include_router(health.router, prefix=settings.api_prefix)
    app.include_router(sessions.router, prefix=settings.api_prefix)
    app.include_router(turns.router, prefix=settings.api_prefix)
    app.include_router(vitals.router, prefix=settings.api_prefix)
    app.include_router(actions.router, prefix=settings.api_prefix)
    return app


app = create_app()
