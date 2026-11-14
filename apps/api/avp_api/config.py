"""Application settings, read from the environment via pydantic-settings.

Never hard-code model ids, keys or URLs (CLAUDE.md "Hard rules" 5, ADR-0006).
Secrets live in .env (see repo-root .env.example); only NEXT_PUBLIC_* reach the
browser, and none of those are defined here.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Local dev convenience. pydantic-settings gives LATER files priority, so the
        # repo-root file comes first and apps/api/.env (cwd) overrides it. Real
        # environment variables still win over both (AVP-123).
        env_file=("../../.env", ".env"),
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
    # --- Privacy (Slice 13, AVP-115) ---
    # Server-side only: lets DELETE /me also remove the Supabase Auth user via the
    # Admin API. Never logged, never sent to apps/web. Unset = profile and sessions
    # are deleted, the login account itself stays (the response says so).
    supabase_secret_key: str | None = Field(default=None, repr=False)
    # Guest sessions older than this are deleted by `python -m avp_api.jobs.cleanup`.
    # 30 is a proposed default only: OPEN_QUESTIONS Q7 (retention) is undecided.
    guest_retention_days: int = Field(default=30, ge=1)

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
    tts_provider: str | None = None  # "google" | "vieneu" | unset
    tts_api_key: str | None = Field(default=None, repr=False)
    # Self-hosted TTS server root, e.g. http://127.0.0.1:8880 (vieneu only).
    tts_base_url: str | None = None
    tts_voice_id: str | None = None
    tts_language: str = "vi-VN"
    tts_timeout_s: float = 8.0
    # --- Exam mode (Slice 12, AVP-112). Seconds per exam session; None = no limit.
    # The value is undecided (docs/OPEN_QUESTIONS.md Q9), so the default is no limit.
    # Guided (practice) sessions are never time-limited.
    exam_time_limit_s: int | None = Field(default=None, ge=1)

    @field_validator("exam_time_limit_s", mode="before")
    @classmethod
    def _blank_is_none(cls, v: object) -> object:
        # `EXAM_TIME_LIMIT_S=` (blank, as in .env.example) means "no limit".
        return None if isinstance(v, str) and not v.strip() else v

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
