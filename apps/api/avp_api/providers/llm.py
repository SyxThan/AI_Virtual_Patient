"""LLM provider adapter (ADR-0006).

One interface, a `FakeLLMProvider` for offline dev/tests (no network, no key), and
a `GeminiProvider` selected by env config. Model ids/keys come from settings,
never hard-coded. The real provider is import-lazy so CI/tests need no SDK/key.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod

from avp_api.config import get_settings


class LLMProvider(ABC):
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

    def generate(
        self, prompt: str, system_prompt: str | None = None, temperature: float = 0.2
    ) -> str:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self._api_key)
        config = types.GenerateContentConfig(
            system_instruction=system_prompt, temperature=temperature
        )
        resp = client.models.generate_content(
            model=self._model, contents=prompt, config=config
        )
        return re.sub(r"\s+", " ", (resp.text or "")).strip()


def get_llm_provider() -> LLMProvider:
    s = get_settings()
    if s.llm_provider == "gemini" and s.llm_api_key and s.llm_model_patient:
        return GeminiProvider(s.llm_api_key, s.llm_model_patient)
    return FakeLLMProvider()
