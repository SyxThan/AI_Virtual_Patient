"""LLM provider adapter (ADR-0006).

One interface, a `FakeLLMProvider` for offline dev/tests (no network, no key), and
a `GeminiProvider` selected by env config. Model ids/keys come from settings,
never hard-coded. The real provider is import-lazy so CI/tests need no SDK/key.
"""

from __future__ import annotations

import logging
import random
import re
import threading
import time
from abc import ABC, abstractmethod

from avp_api.config import get_settings

# Retry transient Gemini errors (503 overload, 429 rate limit) a few times, within
# each provider's wait budget (GeminiProvider.max_retry_wait_s).
_GEMINI_ATTEMPTS = 4
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
    """Overload, rate limit, server error or timeout: another model may still answer."""
    if isinstance(exc, TimeoutError) or "Timeout" in type(exc).__name__:
        return True  # e.g. httpx.ReadTimeout from the SDK's request deadline
    return getattr(exc, "code", None) in _TRANSIENT_CODES


def gemini_http_options(timeout_s: float):
    """SDK request options with a deadline (milliseconds), shared by LLM and embeddings."""
    from google.genai import types

    return types.HttpOptions(timeout=int(timeout_s * 1000))


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


_clients: dict[tuple[str, float], object] = {}
_clients_lock = threading.Lock()


def _gemini_client(api_key: str, timeout_s: float):
    """One SDK client per (key, deadline) for the process, so turns reuse the open
    HTTPS connection instead of paying a new handshake each time (AVP-167)."""
    from google import genai

    key = (api_key, timeout_s)
    with _clients_lock:
        client = _clients.get(key)
        if client is None:
            client = genai.Client(api_key=api_key, http_options=gemini_http_options(timeout_s))
            _clients[key] = client
        return client


_RETRY_DELAY_RE = re.compile(r"^(\d+(?:\.\d+)?)s$")


def server_retry_delay_s(exc: BaseException) -> float | None:
    """Seconds Gemini asks us to wait (google.rpc.RetryInfo.retryDelay, e.g. "21s")
    in a 429 body, or None. Only this number is read from the body."""
    details = getattr(exc, "details", None)
    err = details.get("error", details) if isinstance(details, dict) else None
    items = err.get("details", []) if isinstance(err, dict) else []
    for item in items if isinstance(items, list) else []:
        if isinstance(item, dict) and str(item.get("@type", "")).endswith("RetryInfo"):
            m = _RETRY_DELAY_RE.match(str(item.get("retryDelay", "")))
            if m:
                return float(m.group(1))
    return None


def backoff_s(attempt: int, server_hint_s: float | None, rng: random.Random | None = None) -> float:
    """Wait before retry `attempt` (0-based): the server's hint when it gives one,
    else exponential 0.8, 1.6, 3.2 s ... with +-25% jitter so retries do not line up."""
    if server_hint_s is not None:
        return server_hint_s
    base = _GEMINI_BACKOFF_S * (2**attempt)
    return base * (0.75 + 0.5 * (rng or random).random())


class GeminiProvider(LLMProvider):
    """Google Gemini via the google-genai SDK (optional extra `llm`). Lazy-imported
    so the SDK is required only when this provider is actually selected.

    Transient errors (429, 5xx) are retried while the total wait stays within
    `max_retry_wait_s`: small on the hot path (the Patient then falls back to
    another model, which has its own quota), larger for cold-path scoring."""

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout_s: float = 60.0,
        max_retry_wait_s: float = 4.0,
        sleep=time.sleep,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._timeout_s = timeout_s
        self._max_retry_wait_s = max_retry_wait_s
        self._sleep = sleep
        self.model_id = model

    def generate(
        self, prompt: str, system_prompt: str | None = None, temperature: float = 0.2
    ) -> str:
        from google.genai import errors as genai_errors
        from google.genai import types

        client = _gemini_client(self._api_key, self._timeout_s)
        config = types.GenerateContentConfig(
            system_instruction=system_prompt, temperature=temperature
        )
        waited = 0.0
        for attempt in range(_GEMINI_ATTEMPTS):
            try:
                resp = client.models.generate_content(  # type: ignore[attr-defined]
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
                delay = backoff_s(attempt, server_retry_delay_s(exc))
                if attempt == _GEMINI_ATTEMPTS - 1 or waited + delay > self._max_retry_wait_s:
                    raise  # out of budget: the caller's fallback model takes over
                logger.info(
                    "llm %s %s, retry in %.1f s", self._model, describe_provider_error(exc), delay
                )
                self._sleep(delay)
                waited += delay
        raise RuntimeError("unreachable")  # pragma: no cover


def get_llm_provider() -> LLMProvider:
    """Hot-path Patient model. With LLM_MODEL_PATIENT_FALLBACK set (and different),
    an overloaded or rate-limited primary hands the turn to the fallback model after
    at most LLM_PATIENT_MAX_RETRY_WAIT_S of retries, instead of making the student wait."""
    s = get_settings()
    if s.llm_provider == "gemini" and s.llm_api_key and s.llm_model_patient:
        wait = getattr(s, "llm_patient_max_retry_wait_s", 2.0)
        timeout = getattr(s, "llm_patient_timeout_s", 15.0)
        primary = GeminiProvider(s.llm_api_key, s.llm_model_patient, timeout, wait)
        fallback = getattr(s, "llm_model_patient_fallback", None)
        if fallback and fallback != s.llm_model_patient:
            fb = GeminiProvider(s.llm_api_key, fallback, timeout, wait)
            return FallbackLLMProvider(primary, fb)
        return primary
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
    # A separate key (another Google project) gives scoring its own quota, so a
    # demo's scoring never eats the Patient's requests-per-minute (AVP-167).
    key = getattr(s, "llm_api_key_evaluator", None) or s.llm_api_key
    if s.llm_provider == "gemini" and key and model:
        wait = getattr(s, "llm_evaluator_max_retry_wait_s", 30.0)
        primary = GeminiProvider(key, model, s.llm_timeout_s, wait)
        fallback = s.llm_model_evaluator_fallback
        if fallback and fallback != model:
            fb = GeminiProvider(key, fallback, s.llm_timeout_s, wait)
            return FallbackLLMProvider(primary, fb)
        return primary
    return FakeLLMProvider()
