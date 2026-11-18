#!/usr/bin/env python
"""Check every configured model before a demo (reads .env): Patient, Evaluator,
Evaluator fallback and embeddings. For each one: is the id in the key's model
list, and does one tiny call answer? Prints OK/FAIL with the error type and HTTP
status only. No secrets and no provider messages are printed (AVP-144).

Run from apps/api so the API's .env is used:  cd apps/api && python ../../scripts/check_llm.py
Exit code 0 when every configured model answers, 1 otherwise.

Typical failures:
  ClientError(404)  model id retired or not open to this key: pick one from the list printed
  ClientError(429)  quota exhausted; a free-tier key has 0 quota for Pro models
  ServerError(503)  model overloaded right now: retry later (the fallback covers this)
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass

from avp_api.config import get_settings
from avp_api.providers.llm import describe_provider_error


@dataclass(frozen=True)
class Check:
    role: str
    model: str
    listed: bool | None  # None = the model list could not be fetched
    error: str | None  # None = the test call answered

    @property
    def ok(self) -> bool:
        return self.error is None


def configured_models(s) -> list[tuple[str, str, str]]:
    """(role, model id, kind) for every model the API would use. kind: llm | embed."""
    out: list[tuple[str, str, str]] = []
    if s.llm_model_patient:
        out.append(("patient", s.llm_model_patient, "llm"))
    patient_fb = getattr(s, "llm_model_patient_fallback", None)
    if patient_fb and patient_fb != s.llm_model_patient:
        out.append(("patient fallback", patient_fb, "llm"))
    evaluator = s.llm_model_evaluator or s.llm_model_patient
    if evaluator:
        out.append(("evaluator", evaluator, "llm"))
    if s.llm_model_evaluator_fallback and s.llm_model_evaluator_fallback != evaluator:
        out.append(("evaluator fallback", s.llm_model_evaluator_fallback, "llm"))
    if s.embedding_model:
        out.append(("embedding", s.embedding_model, "embed"))
    return out


def run_checks(
    models: Iterable[tuple[str, str, str]],
    available: set[str] | None,
    call_llm: Callable[[str], object],
    call_embed: Callable[[str], object],
) -> list[Check]:
    results = []
    for role, model, kind in models:
        listed = None if available is None else model in available
        try:
            (call_embed if kind == "embed" else call_llm)(model)
            error = None
        except Exception as exc:  # noqa: BLE001 - diagnostic: classify, never print the message
            error = describe_provider_error(exc)
        results.append(Check(role, model, listed, error))
    return results


def _gemini_calls(api_key: str):
    from google import genai
    from google.genai import types

    from avp_api.providers.embeddings import EMBEDDING_DIM
    from avp_api.providers.llm import GeminiProvider

    client = genai.Client(api_key=api_key)

    def list_models() -> set[str]:
        return {m.name.removeprefix("models/") for m in client.models.list()}

    def call_llm(model: str) -> object:
        return GeminiProvider(api_key, model).generate("Trả lời đúng một từ: OK")

    def call_embed(model: str) -> object:
        cfg = types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM)
        return client.models.embed_content(model=model, contents=["sốt"], config=cfg)

    return list_models, call_llm, call_embed


def main() -> int:
    s = get_settings()
    print("LLM_PROVIDER =", s.llm_provider, "| LLM_API_KEY set =", bool(s.llm_api_key))
    if s.llm_provider != "gemini" or not s.llm_api_key:
        print("Fake providers in use (no real model to check).")
        return 0
    list_models, call_llm, call_embed = _gemini_calls(s.llm_api_key)
    try:
        available: set[str] | None = list_models()
    except Exception as exc:  # noqa: BLE001
        print("Could not list models:", describe_provider_error(exc))
        available = None
    results = run_checks(configured_models(s), available, call_llm, call_embed)
    for r in results:
        listed = "?" if r.listed is None else ("listed" if r.listed else "NOT LISTED")
        status = "OK  " if r.ok else f"FAIL {r.error}"
        print(f"  {r.role:<19} {r.model:<28} {listed:<11} {status}")
    if not all(r.ok for r in results) and available:
        print("\nModels this key can see (pick ids from here):")
        for name in sorted(n for n in available if "gemini" in n):
            print("  ", name)
    return 0 if all(r.ok for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
