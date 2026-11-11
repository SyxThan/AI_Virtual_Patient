"""Application settings, read from the environment via pydantic-settings.

Never hard-code model ids, keys or URLs (CLAUDE.md "Hard rules" 5, ADR-0006).
Secrets live in .env (see repo-root .env.example); only NEXT_PUBLIC_* reach the
browser, and none of those are defined here.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),  # local dev convenience; real env wins
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App ---
    app_name: str = "AI Virtual Patient API"
    api_prefix: str = "/api/v1"
    # Comma-separated CORS origins, e.g. "http://localhost:3000".
    allowed_origins: str = "http://localhost:3000"
    # Public web origin printed in the practice-report QR code (Slice 9, AVP-105).
    web_base_url: str = "http://localhost:3000"

    # --- Data access (ADR-0007). Optional until AVP-007/AVP-034. ---
    database_url: str | None = None
    supabase_url: str | None = None
    # --- Auth (ADR-0008, AVP-106). Public JWKS only; no Supabase secret is needed. ---
    supabase_jwt_audience: str = "authenticated"
    jwks_cache_ttl_s: float = 600.0

    # --- Provider adapters (ADR-0006). Optional until the agents land. ---
    llm_provider: str | None = None
    llm_api_key: str | None = Field(default=None, repr=False)
    llm_model_patient: str | None = None
    llm_model_evaluator: str | None = None
    # RAG embeddings (Slice 8, AVP-018). Changing the model means re-ingesting the
    # corpus: chunks are stored with the model id and only same-model chunks match.
    embedding_model: str | None = None

    # --- Voice adapters (Slice 6). Unset = offline Fake providers. ---
    stt_provider: str | None = None  # "google" | unset
    stt_api_key: str | None = Field(default=None, repr=False)
    stt_model: str | None = None
    stt_language: str = "vi-VN"
    stt_timeout_s: float = 8.0
    tts_provider: str | None = None  # "google" | unset
    tts_api_key: str | None = Field(default=None, repr=False)
    tts_voice_id: str | None = None
    tts_language: str = "vi-VN"
    tts_timeout_s: float = 8.0

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
