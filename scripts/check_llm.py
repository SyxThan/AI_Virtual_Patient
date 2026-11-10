#!/usr/bin/env python
"""Diagnose the configured LLM provider (reads .env). Prints the selected provider
and the result of one tiny test call, with the full error if it fails.
No secrets are printed (only whether the key is set)."""

from __future__ import annotations

import traceback

from avp_api.config import get_settings
from avp_api.providers.llm import get_llm_provider


def main() -> int:
    s = get_settings()
    print("LLM_PROVIDER      =", s.llm_provider)
    print(
        "LLM_API_KEY set   =", bool(s.llm_api_key), f"(len={len(s.llm_api_key or '')})"
    )
    print("LLM_MODEL_PATIENT =", repr(s.llm_model_patient))
    provider = get_llm_provider()
    print("selected provider =", type(provider).__name__)
    if type(provider).__name__ == "FakeLLMProvider":
        print(
            "\n=> Using the FAKE provider (so no real Gemini call). To use Gemini, set"
        )
        print(
            "   LLM_PROVIDER=gemini, LLM_API_KEY=<key>, LLM_MODEL_PATIENT=gemini-3.8-flash."
        )
        return 0
    try:
        out = provider.generate(
            prompt="Xin chào, bé nhà mình bị sao ạ?",
            system_prompt="Bạn là người mẹ, trả lời ngắn gọn bằng tiếng Việt.",
        )
        print("\nOK — reply:", (out or "")[:160])
        return 0
    except Exception:  # noqa: BLE001 — diagnostic: surface any provider error
        print("\nERROR calling the provider:\n")
        traceback.print_exc()
        print("\nCommon causes: wrong LLM_MODEL_PATIENT (e.g. 'gemini-3.8-flash');")
        print("503 UNAVAILABLE = model overloaded, retry; API key not enabled for the")
        print("Generative Language API; region/quota. The error above says which.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
