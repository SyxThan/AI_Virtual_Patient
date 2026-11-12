"""apps/api/.env must override the repo-root .env (AVP-123).

Regression: env_file=(".env", "../../.env") let the root file win, so the API
verified tokens against a different Supabase project than the web app signed in
to, and every Bearer request got 401 AUTH_INVALID.
"""

from __future__ import annotations

import logging

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from avp_api.auth import SupabaseJwtVerifier
from avp_api.config import Settings

API_URL = "https://api-file-project.supabase.co"
ROOT_URL = "https://root-file-project.supabase.co"


@pytest.fixture
def repo(tmp_path, monkeypatch):
    api_dir = tmp_path / "apps" / "api"
    api_dir.mkdir(parents=True)
    (tmp_path / ".env").write_text(
        f"SUPABASE_URL={ROOT_URL}\nWEB_BASE_URL=http://root-only.example\n", encoding="utf-8"
    )
    monkeypatch.chdir(api_dir)
    for var in ("SUPABASE_URL", "WEB_BASE_URL"):
        monkeypatch.delenv(var, raising=False)
    return api_dir


def test_api_env_file_overrides_root_env_file(repo) -> None:
    (repo / ".env").write_text(f"SUPABASE_URL={API_URL}\n", encoding="utf-8")
    s = Settings()
    assert s.supabase_url == API_URL
    assert s.web_base_url == "http://root-only.example"  # root still fills gaps


def test_root_env_file_used_when_api_file_absent(repo) -> None:
    assert Settings().supabase_url == ROOT_URL


def test_real_environment_wins_over_both_files(repo, monkeypatch) -> None:
    (repo / ".env").write_text(f"SUPABASE_URL={API_URL}\n", encoding="utf-8")
    monkeypatch.setenv("SUPABASE_URL", "https://from-env.supabase.co")
    assert Settings().supabase_url == "https://from-env.supabase.co"


def test_unknown_key_id_logs_project_hint_without_token(caplog) -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode({"sub": "x"}, key, algorithm="ES256", headers={"kid": "other-project"})
    verifier = SupabaseJwtVerifier(API_URL, fetch=lambda _url: {"keys": []})
    caplog.set_level(logging.INFO)
    with pytest.raises(Exception) as exc:
        verifier.verify(token)
    assert getattr(exc.value, "status_code", None) == 401
    assert "NEXT_PUBLIC_SUPABASE_URL" in caplog.text
    assert token not in caplog.text
