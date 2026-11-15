"""Speech-to-text adapter (Slice 6, ADR-0006).

Mirrors providers/llm.py: one interface, an offline `FakeSTTProvider` (no network,
no key), real providers selected by env, and `get_stt_provider()` which falls
back to the Fake when nothing is configured. Callers use `transcribe_timed()` to
get the measured latency and a typed `VoiceProviderError` on any failure.
"""

from __future__ import annotations

import asyncio
import base64
import json
import secrets
import urllib.error
import urllib.request
from abc import ABC, abstractmethod

from avp_api.config import get_settings
from avp_api.providers.voice_common import (
    Timed,
    VoiceProviderError,
    post_json,
    run_timed,
    valid_base_url,
)

_GOOGLE_STT_URL = "https://speech.googleapis.com/v1/speech:recognize"


class STTProvider(ABC):
    name: str = "unknown"

    @abstractmethod
    async def transcribe(self, audio_bytes: bytes, language: str = "vi") -> str:
        """Transcribe audio bytes into text."""


class FakeSTTProvider(STTProvider):
    """Offline, deterministic. Ignores the audio content (synthetic in tests)."""

    name = "fake"
    TRANSCRIPT = "Cháu bị sốt từ hôm qua và quấy khóc nhiều bác sĩ ạ."

    async def transcribe(self, audio_bytes: bytes, language: str = "vi") -> str:
        return self.TRANSCRIPT


class GoogleSTTProvider(STTProvider):
    """Google Cloud Speech-to-Text v1 `speech:recognize` (synchronous, short audio)
    over REST with an API key header. Accepts the browser's WEBM_OPUS directly.
    Only used when STT_PROVIDER=google and STT_API_KEY are set by the human."""

    name = "google"

    def __init__(self, api_key: str, model: str | None, language: str, timeout_s: float) -> None:
        self._api_key = api_key
        self._model = model
        self._language = language
        self._timeout_s = timeout_s

    def _recognize(self, audio_bytes: bytes) -> str:
        config: dict = {
            "encoding": "WEBM_OPUS",
            "sampleRateHertz": 48000,
            "languageCode": self._language,
        }
        if self._model:
            config["model"] = self._model
        payload = {"config": config, "audio": {"content": base64.b64encode(audio_bytes).decode()}}
        data = post_json(_GOOGLE_STT_URL, payload, self._api_key, self._timeout_s)
        parts = [
            r["alternatives"][0].get("transcript", "")
            for r in data.get("results", [])
            if r.get("alternatives")
        ]
        return " ".join(p.strip() for p in parts if p.strip())

    async def transcribe(self, audio_bytes: bytes, language: str = "vi") -> str:
        return await asyncio.to_thread(self._recognize, audio_bytes)


# A transcript is short text; anything bigger is not a reply from a sane server.
_WHISPER_MAX_RESPONSE_BYTES = 256 * 1024
_CRLF = b"\r\n"


def _iso_language(language: str) -> str:
    """'vi-VN' -> 'vi': Whisper-style servers take an ISO-639-1 code."""
    return language.split("-", 1)[0].strip().lower() or "vi"


class WhisperSTTProvider(STTProvider):
    """Self-hosted Whisper behind the OpenAI-compatible
    `POST {base}/v1/audio/transcriptions` (multipart): scripts/stt_server, or any
    compatible server such as speaches. The browser's WEBM/Opus is sent as is and
    decoded by the server. Audio never leaves the configured host.
    Only used when STT_PROVIDER=whisper and STT_BASE_URL are set by the human."""

    name = "whisper"

    def __init__(
        self,
        base_url: str,
        api_key: str | None,
        model: str | None,
        language: str,
        timeout_s: float,
    ) -> None:
        self._url = base_url.rstrip("/") + "/v1/audio/transcriptions"
        self._api_key = api_key
        self._model = model
        self._language = _iso_language(language)
        self._timeout_s = timeout_s

    def _body(self, audio_bytes: bytes) -> tuple[bytes, str]:
        boundary = "avp-" + secrets.token_hex(16)
        fields = {"language": self._language, "response_format": "json"}
        if self._model:
            fields["model"] = self._model
        out = bytearray()
        for key, value in fields.items():
            out += f"--{boundary}".encode() + _CRLF
            out += f'Content-Disposition: form-data; name="{key}"'.encode() + _CRLF + _CRLF
            out += value.encode() + _CRLF
        out += f"--{boundary}".encode() + _CRLF
        out += b'Content-Disposition: form-data; name="file"; filename="audio.webm"' + _CRLF
        out += b"Content-Type: audio/webm" + _CRLF + _CRLF
        out += audio_bytes + _CRLF
        out += f"--{boundary}--".encode() + _CRLF
        return bytes(out), f"multipart/form-data; boundary={boundary}"

    def _recognize(self, audio_bytes: bytes) -> str:
        body, content_type = self._body(audio_bytes)
        headers = {"Content-Type": content_type, "Accept": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        req = urllib.request.Request(self._url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self._timeout_s) as resp:  # noqa: S310 - scheme checked
                raw = resp.read(_WHISPER_MAX_RESPONSE_BYTES + 1)
        except urllib.error.HTTPError as exc:
            # Status code only; the body may echo request details.
            raise RuntimeError(f"HTTP {exc.code}") from None
        if len(raw) > _WHISPER_MAX_RESPONSE_BYTES:
            raise RuntimeError("response too large")
        data = json.loads(raw.decode("utf-8"))
        text = data.get("text") if isinstance(data, dict) else None
        if not isinstance(text, str):
            raise RuntimeError("malformed response")
        return " ".join(text.split())

    async def transcribe(self, audio_bytes: bytes, language: str = "vi") -> str:
        return await asyncio.to_thread(self._recognize, audio_bytes)


def get_stt_provider() -> STTProvider:
    s = get_settings()
    if s.stt_provider == "google" and s.stt_api_key:
        return GoogleSTTProvider(s.stt_api_key, s.stt_model, s.stt_language, s.stt_timeout_s)
    if s.stt_provider == "whisper" and valid_base_url(s.stt_base_url):
        return WhisperSTTProvider(
            s.stt_base_url, s.stt_api_key, s.stt_model, s.stt_language, s.stt_timeout_s
        )
    return FakeSTTProvider()


async def transcribe_timed(
    provider: STTProvider, audio_bytes: bytes, timeout_s: float | None = None
) -> Timed[str]:
    """Transcribe with a timeout and measured latency. Raises VoiceProviderError
    (never a raw provider exception); an empty transcript is also a failure."""
    if not audio_bytes:
        raise VoiceProviderError("stt", "empty_audio")
    timeout = timeout_s if timeout_s is not None else get_settings().stt_timeout_s
    result = await run_timed("stt", provider.name, provider.transcribe(audio_bytes), timeout)
    text = (result.value or "").strip()
    if not text:
        raise VoiceProviderError("stt", "empty_result")
    return Timed(value=text, elapsed_ms=result.elapsed_ms)
