"""Evaluator model fallback, safe provider-error logs and the model check script (AVP-144).

Synthetic transcripts and fake providers only; no network.
"""

from __future__ import annotations

import datetime
import importlib.util
import json
import logging
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from avp_api.db.repositories.turn_repo import TurnRecord
from avp_api.providers import llm as llm_mod
from avp_api.providers.llm import (
    FallbackLLMProvider,
    LLMProvider,
    describe_provider_error,
    is_transient_provider_error,
)
from avp_api.services.evaluator_agent import EvaluatorError, evaluate_transcript

REPO_ROOT = Path(__file__).resolve().parents[3]
CASE = json.loads((REPO_ROOT / "data/cases/case-01-hfmd.json").read_text("utf-8"))
SECRET_MESSAGE = "prompt text that must never reach the logs"

_spec = importlib.util.spec_from_file_location(
    "avp_check_llm", REPO_ROOT / "scripts" / "check_llm.py"
)
check_llm = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = check_llm
_spec.loader.exec_module(check_llm)


class ClientError(Exception):
    """Shape of google.genai errors: an int `code` attribute."""

    def __init__(self, code: int) -> None:
        super().__init__(f"{code} {SECRET_MESSAGE}")
        self.code = code


class Raising(LLMProvider):
    def __init__(self, model_id: str, code: int) -> None:
        self.model_id = model_id
        self.code = code
        self.calls = 0

    def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
        self.calls += 1
        raise ClientError(self.code)


class Answering(LLMProvider):
    def __init__(self, model_id: str, reply: str = "ok") -> None:
        self.model_id = model_id
        self.reply = reply
        self.calls = 0

    def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
        self.calls += 1
        return self.reply


def _turns() -> list[TurnRecord]:
    now = datetime.datetime(2026, 11, 17, tzinfo=datetime.UTC)
    lines = [("student", "Chào chị, bé sốt từ khi nào ạ?"), ("patient", "Dạ cháu sốt ba ngày rồi.")]
    return [TurnRecord(i, "s", i, who, text, i * 1000, now) for i, (who, text) in enumerate(lines)]


# --- error description ---------------------------------------------------------------


def test_describe_keeps_type_and_status_only() -> None:
    exc = ClientError(404)
    assert describe_provider_error(exc) == "ClientError(404)"
    assert SECRET_MESSAGE not in describe_provider_error(exc)
    assert describe_provider_error(ValueError("x")) == "ValueError"


@pytest.mark.parametrize(
    ("code", "transient"), [(429, True), (503, True), (500, True), (404, False), (400, False)]
)
def test_transient_classification(code: int, transient: bool) -> None:
    assert is_transient_provider_error(ClientError(code)) is transient


# --- fallback provider -----------------------------------------------------------------


def test_primary_answer_is_used_and_recorded() -> None:
    p, f = Answering("primary", "a"), Answering("fallback", "b")
    wrapped = FallbackLLMProvider(p, f)
    assert wrapped.generate("q") == "a"
    assert wrapped.model_id == "primary"
    assert f.calls == 0


def test_overloaded_primary_falls_back_and_records_the_model(caplog) -> None:
    p, f = Raising("primary", 503), Answering("fallback", "b")
    wrapped = FallbackLLMProvider(p, f)
    with caplog.at_level(logging.WARNING, logger="avp_api.providers.llm"):
        assert wrapped.generate("q") == "b"
    assert wrapped.model_id == "fallback"
    assert "ClientError(503)" in caplog.text
    assert SECRET_MESSAGE not in caplog.text


def test_config_error_is_not_hidden_by_the_fallback() -> None:
    p, f = Raising("retired-model", 404), Answering("fallback")
    with pytest.raises(ClientError):
        FallbackLLMProvider(p, f).generate("q")
    assert f.calls == 0


def test_factory_wraps_only_when_a_distinct_fallback_is_set(monkeypatch) -> None:
    def settings(fallback):
        return SimpleNamespace(
            llm_provider="gemini",
            llm_api_key="k",
            llm_model_patient="m-patient",
            llm_model_evaluator="m-eval",
            llm_model_evaluator_fallback=fallback,
        )

    monkeypatch.setattr(llm_mod, "get_settings", lambda: settings("m-lite"))
    wrapped = llm_mod.get_evaluator_provider()
    assert isinstance(wrapped, FallbackLLMProvider)
    assert (wrapped.primary.model_id, wrapped.fallback.model_id) == ("m-eval", "m-lite")

    monkeypatch.setattr(llm_mod, "get_settings", lambda: settings(None))
    assert not isinstance(llm_mod.get_evaluator_provider(), FallbackLLMProvider)
    monkeypatch.setattr(llm_mod, "get_settings", lambda: settings("m-eval"))
    assert not isinstance(llm_mod.get_evaluator_provider(), FallbackLLMProvider)


# --- evaluator logging -------------------------------------------------------------------


def test_retired_model_logs_type_and_status_and_stores_safe_code(caplog) -> None:
    with caplog.at_level(logging.WARNING, logger="avp_api.evaluator"):
        with pytest.raises(EvaluatorError) as err:
            evaluate_transcript(CASE, _turns(), Raising("gemini-1.5-pro", 404))
    assert err.value.code == "PROVIDER_ERROR"
    assert "gemini-1.5-pro" in caplog.text and "ClientError(404)" in caplog.text
    assert SECRET_MESSAGE not in caplog.text


# --- check_llm script ----------------------------------------------------------------------


def test_configured_models_lists_each_role_once() -> None:
    s = SimpleNamespace(
        llm_model_patient="a",
        llm_model_evaluator="b",
        llm_model_evaluator_fallback="b",
        embedding_model="e",
    )
    assert check_llm.configured_models(s) == [
        ("patient", "a", "llm"),
        ("evaluator", "b", "llm"),
        ("embedding", "e", "embed"),
    ]


def test_run_checks_flags_unlisted_and_failing_models() -> None:
    models = [("evaluator", "gone", "llm"), ("embedding", "e", "embed")]

    def call_llm(model):
        raise ClientError(404)

    results = check_llm.run_checks(models, {"e"}, call_llm, lambda m: [0.0])
    assert [(r.model, r.listed, r.ok, r.error) for r in results] == [
        ("gone", False, False, "ClientError(404)"),
        ("e", True, True, None),
    ]
