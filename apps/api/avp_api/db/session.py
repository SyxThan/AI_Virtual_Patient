"""Database engine and session (the only place a DB connection is created).

Lazy: the engine is built on first use, so unit tests that override the
repository dependency never need DATABASE_URL (CLAUDE.md: no DB in unit tests).
"""

from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from avp_api.config import get_settings


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set; configure .env (see .env.example)")
    # Session-mode pooler: small pool, pre-ping (docs/specs/database.md).
    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        hide_parameters=True,  # SQL errors must not log student quotes (T-SEC-02)
    )


@lru_cache
def _maker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with _maker()() as db:
        yield db
