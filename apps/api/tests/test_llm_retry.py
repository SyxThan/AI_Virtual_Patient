"""Gemini retry budget, server retry hints and the Patient fallback (AVP-167).

No network: the SDK client is replaced by a scripted fake. google-genai is the
optional `llm` extra (CI installs only `dev`), so the tests that need its error
types and request config skip without it; backoff and factory tests always run.
"""

from __future__ import annotations

import random
from types import SimpleNamespace

import pytest

from avp_api.providers import llm as llm_mod
from avp_api.providers.llm import (
    FallbackLLMProvider,
    GeminiProvider,
    backoff_s,
    server_retry_delay_s,
)

try:
    from google.genai import errors as genai_errors
except ImportError:  # optional extra not installed
    genai_errors = None

needs_sdk = pytest.mark.skipif(genai_errors is None, reason="google-genai (extra 'llm') missing")


def _rate_limited(delay: str | None = None):
    details = []
    if delay is not None:
        details.append({"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": delay})
    body = {
        "error": {
            "code": 429,
            "message": "quota",
            "status": "RESOURCE_EXHAUSTED",
            "details": details,
        }
    }
    return genai_errors.ClientError(429, body)


def _overloaded():
    return genai_errors.ServerError(
        503, {"error": {"code": 503, "message": "busy", "status": "UNAVAILABLE"}}
    )


class ScriptedClient:
    """`client.models.generate_content` raises or answers in the given order."""

    def __init__(self, script: list) -> None:
        self.script = list(script)
        self.calls = 0
        self.models = self

    def generate_content(self, model, contents, config):
        self.calls += 1
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return SimpleNamespace(text=step)


@pytest.fixture
def client(monkeypatch):
    holder: dict = {}

    def install(script):
        holder["c"] = ScriptedClient(script)
        monkeypatch.setattr(llm_mod, "_gemini_client", lambda key, timeout: holder["c"])
        return holder["c"]

    return install


@needs_sdk
def test_retry_delay_is_read_from_retry_info_only():
    assert server_retry_delay_s(_rate_limited("21s")) == 21.0
    assert server_retry_delay_s(_rate_limited("1.5s")) == 1.5
    assert server_retry_delay_s(_rate_limited(None)) is None
    assert server_retry_delay_s(_rate_limited("soon")) is None
    assert server_retry_delay_s(_overloaded()) is None
    assert server_retry_delay_s(ValueError("x")) is None


def test_backoff_uses_the_server_hint_else_jittered_exponential():
    assert backoff_s(0, 7.0) == 7.0
    rng = random.Random(1)
    for attempt, base in [(0, 0.8), (1, 1.6), (2, 3.2)]:
        wait = backoff_s(attempt, None, rng)
        assert 0.75 * base <= wait <= 1.25 * base


@needs_sdk
def test_transient_error_is_retried_within_budget(client):
    c = client([_overloaded(), "  Dạ cháu sốt\n ba ngày ạ. "])
    slept: list[float] = []
    p = GeminiProvider("k", "m", max_retry_wait_s=5.0, sleep=slept.append)
    assert p.generate("q") == "Dạ cháu sốt ba ngày ạ."
    assert c.calls == 2 and len(slept) == 1


@needs_sdk
def test_long_server_hint_skips_the_wait_and_raises(client):
    c = client([_rate_limited("30s"), "never reached"])
    slept: list[float] = []
    p = GeminiProvider("k", "m", max_retry_wait_s=2.0, sleep=slept.append)
    with pytest.raises(genai_errors.ClientError):
        p.generate("q")
    assert c.calls == 1 and slept == []  # no point waiting 30 s with a student on the line


@needs_sdk
def test_config_errors_are_not_retried(client):
    c = client([genai_errors.ClientError(404, {"error": {"code": 404, "message": "gone"}}), "x"])
    p = GeminiProvider("k", "m", sleep=lambda s: None)
    with pytest.raises(genai_errors.ClientError):
        p.generate("q")
    assert c.calls == 1


def _settings(**over):
    base = dict(
        llm_provider="gemini",
        llm_api_key="k",
        llm_api_key_evaluator=None,
        llm_model_patient="m-patient",
        llm_model_patient_fallback=None,
        llm_model_evaluator="m-eval",
        llm_model_evaluator_fallback=None,
        llm_timeout_s=30.0,
        llm_patient_timeout_s=15.0,
        llm_patient_max_retry_wait_s=2.0,
        llm_evaluator_max_retry_wait_s=30.0,
    )
    base.update(over)
    return SimpleNamespace(**base)


def test_patient_factory_wraps_a_distinct_fallback(monkeypatch):
    monkeypatch.setattr(
        llm_mod, "get_settings", lambda: _settings(llm_model_patient_fallback="m-lite")
    )
    p = llm_mod.get_llm_provider()
    assert isinstance(p, FallbackLLMProvider)
    assert (p.primary.model_id, p.fallback.model_id) == ("m-patient", "m-lite")
    assert p.primary._max_retry_wait_s == 2.0
    # Hot path: the short Patient deadline, not the cold-path LLM_TIMEOUT_S.
    assert p.primary._timeout_s == 15.0 and p.fallback._timeout_s == 15.0

    monkeypatch.setattr(
        llm_mod, "get_settings", lambda: _settings(llm_model_patient_fallback="m-patient")
    )
    assert isinstance(llm_mod.get_llm_provider(), GeminiProvider)


def test_evaluator_uses_its_own_key_and_longer_budget(monkeypatch):
    monkeypatch.setattr(llm_mod, "get_settings", lambda: _settings(llm_api_key_evaluator="k-eval"))
    p = llm_mod.get_evaluator_provider()
    assert isinstance(p, GeminiProvider)
    assert p._api_key == "k-eval" and p._max_retry_wait_s == 30.0
    assert p._timeout_s == 30.0  # scoring keeps the long LLM_TIMEOUT_S

    monkeypatch.setattr(llm_mod, "get_settings", lambda: _settings())
    assert llm_mod.get_evaluator_provider()._api_key == "k"
