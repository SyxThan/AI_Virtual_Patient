"""LLM provider adapter (ADR-0006).

One interface, a `FakeLLMProvider` for offline dev/tests (no network, no key), and
a `GeminiProvider` selected by env config. Model ids/keys come from settings,
never hard-coded. The real provider is import-lazy so CI/tests need no SDK/key.
"""

from __future__ import annotations

import logging
import re
import time
from abc import ABC, abstractmethod

from avp_api.config import get_settings

# Retry transient Gemini errors (503 overload, 429 rate limit) a few times.
_GEMINI_ATTEMPTS = 3
_GEMINI_BACKOFF_S = 0.8

logger = logging.getLogger("avp_api.providers.llm")

# HTTP statuses that mean "try again / try another model", not "fix the config".
_TRANSIENT_CODES = frozenset({429, 500, 502, 503, 504})


def describe_provider_error(exc: BaseException) -> str:
    """Exception type plus HTTP status, e.g. `ClientError(404)`. Never the message:
    provider messages can echo prompts. Safe to log (AVP-144)."""
    code = getattr(exc, "code", None)
    return f"{type(exc).__name__}({code})" if isinstance(code, int) else type(exc).__name__


def is_transient_provider_error(exc: BaseException) -> bool:
    """Overload, rate limit or server error: another model may still answer."""
    return getattr(exc, "code", None) in _TRANSIENT_CODES


class LLMProvider(ABC):
    # Stored with every evaluation so a result can be explained later.
    model_id: str = "unknown"

    @abstractmethod
    def generate(
        self, prompt: str, system_prompt: str | None = None, temperature: float = 0.2
    ) -> str: ...


# Keyword -> short, lay, number-free Vietnamese reply (a mother of an 18-month-old).
# Deterministic test/dev double; the real clinical facts live in the case JSON and
# are enforced by the Patient Agent's guardrails, not here.
_FAKE_REPLIES: list[tuple[tuple[str, ...], str]] = [
    (
        ("sốt", "nóng", "thân nhiệt"),
        "Dạ cháu sốt mấy bữa nay rồi, em cho uống hạ sốt thì đỡ một chút rồi lại sốt lại ạ.",
    ),
    (
        ("giật mình", "giật", "ngủ"),
        "Dạ cháu nằm ngủ hay giật mình nảy người lên, em lo lắm bác sĩ ơi.",
    ),
    (("co giật", "trợn", "lên cơn"), "Dạ cháu chưa bị co giật, chỉ giật mình thôi ạ."),
    (
        ("ban", "nốt", "phỏng", "da", "tay", "chân", "mụn"),
        "Dạ lòng bàn tay với bàn chân cháu nổi mấy nốt phỏng nước ạ.",
    ),
    (
        ("miệng", "loét", "ăn", "bú", "dãi", "nuốt"),
        "Dạ miệng cháu có vết loét, cháu đau nên bỏ ăn, chảy dãi nhiều ạ.",
    ),
    (
        ("nhà trẻ", "lớp", "lây", "tiếp xúc", "xung quanh", "bạn"),
        "Dạ cháu đi nhà trẻ, em nghe nói trong lớp có bạn bị bệnh giống vậy ạ.",
    ),
    (
        ("dị ứng", "thuốc gì"),
        "Dạ cái đó em không rõ, cháu chưa dùng thuốc gì lạ nên em chưa để ý ạ.",
    ),
]
_FAKE_FALLBACK = "Dạ em không rõ ạ, em chưa để ý thấy bác sĩ ơi."


class FakeLLMProvider(LLMProvider):
    """Offline, deterministic. Matches the student's question against keywords."""

    model_id = "fake"

    def generate(
        self, prompt: str, system_prompt: str | None = None, temperature: float = 0.2
    ) -> str:
        text = prompt.lower()
        for keywords, reply in _FAKE_REPLIES:
            if any(k in text for k in keywords):
                return reply
        return _FAKE_FALLBACK


class GeminiProvider(LLMProvider):
    """Google Gemini via the google-genai SDK (optional extra `llm`). Lazy-imported
    so the SDK is required only when this provider is actually selected."""

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model
        self.model_id = model

    def generate(
        self, prompt: str, system_prompt: str | None = None, temperature: float = 0.2
    ) -> str:
        from google import genai
        from google.genai import errors as genai_errors
        from google.genai import types

        client = genai.Client(api_key=self._api_key)
        config = types.GenerateContentConfig(
            system_instruction=system_prompt, temperature=temperature
        )
        last_exc: Exception | None = None
        for attempt in range(_GEMINI_ATTEMPTS):
            try:
                resp = client.models.generate_content(
                    model=self._model, contents=prompt, config=config
                )
                return re.sub(r"\s+", " ", (resp.text or "")).strip()
            except genai_errors.APIError as exc:
                # Retry transient overload/rate limit; fail fast on config errors
                # (bad model id, invalid key).
                if not (
                    isinstance(exc, genai_errors.ServerError) or getattr(exc, "code", None) == 429
                ):
                    raise
                last_exc = exc
                time.sleep(_GEMINI_BACKOFF_S * (attempt + 1))
        raise last_exc  # type: ignore[misc]


def get_llm_provider() -> LLMProvider:
    s = get_settings()
    if s.llm_provider == "gemini" and s.llm_api_key and s.llm_model_patient:
        return GeminiProvider(s.llm_api_key, s.llm_model_patient)
    return FakeLLMProvider()


class FallbackLLMProvider(LLMProvider):
    """Try `primary`; if it fails with a transient error (overload, quota, 5xx)
    after its own retries, answer with `fallback`. A config error (bad model id,
    invalid key) is raised as is: hiding it behind a fallback would mask the fix.
    `model_id` is the model that produced the last reply, so stored evaluations
    and debriefs say which model actually scored them (AVP-144)."""

    def __init__(self, primary: LLMProvider, fallback: LLMProvider) -> None:
        self.primary = primary
        self.fallback = fallback
        self.model_id = primary.model_id

    def generate(
        self, prompt: str, system_prompt: str | None = None, temperature: float = 0.2
    ) -> str:
        try:
            out = self.primary.generate(
                prompt, system_prompt=system_prompt, temperature=temperature
            )
            self.model_id = self.primary.model_id
            return out
        except Exception as exc:  # noqa: BLE001 - classified below, re-raised if not transient
            if not is_transient_provider_error(exc):
                raise
            logger.warning(
                "llm %s failed with %s; falling back to %s",
                self.primary.model_id,
                describe_provider_error(exc),
                self.fallback.model_id,
            )
        out = self.fallback.generate(prompt, system_prompt=system_prompt, temperature=temperature)
        self.model_id = self.fallback.model_id
        return out


def get_evaluator_provider() -> LLMProvider:
    """Cold-path Evaluator/Debrief model (LLM_MODEL_EVALUATOR, else the patient
    model), wrapped with LLM_MODEL_EVALUATOR_FALLBACK when that is set and
    different. Fake when no provider/key is configured."""
    s = get_settings()
    model = s.llm_model_evaluator or s.llm_model_patient
    if s.llm_provider == "gemini" and s.llm_api_key and model:
        primary = GeminiProvider(s.llm_api_key, model)
        fallback = s.llm_model_evaluator_fallback
        if fallback and fallback != model:
            return FallbackLLMProvider(primary, GeminiProvider(s.llm_api_key, fallback))
        return primary
    return FakeLLMProvider()
