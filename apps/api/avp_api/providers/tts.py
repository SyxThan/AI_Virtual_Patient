"""Text-to-speech adapter (Slice 6, ADR-0006).

Mirrors providers/llm.py: one interface, an offline `FakeTTSProvider` (a short
synthetic WAV beep, no network, no key), one real provider selected by env, and
`get_tts_provider()` which falls back to the Fake when nothing is configured.
Callers use `synthesize_timed()` for measured latency and typed failures.
"""

from __future__ import annotations

import asyncio
import base64
import io
import math
import struct
import wave
from abc import ABC, abstractmethod
from dataclasses import dataclass

from avp_api.config import get_settings
from avp_api.providers.voice_common import Timed, VoiceProviderError, post_json, run_timed

_GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"


@dataclass(frozen=True)
class SynthesizedAudio:
    audio: bytes
    mime: str  # e.g. "audio/wav", "audio/mpeg"


class TTSProvider(ABC):
    name: str = "unknown"
    mime: str = "application/octet-stream"

    @abstractmethod
    async def synthesize(self, text: str, voice_id: str | None = None) -> bytes:
        """Synthesize text into audio bytes (format given by `mime`)."""


def _beep_wav(duration_s: float = 0.3, freq_hz: float = 440.0, rate: int = 16000) -> bytes:
    """A small, valid mono 16-bit PCM WAV: a quiet sine beep."""
    frames = int(duration_s * rate)
    samples = b"".join(
        struct.pack("<h", int(6000 * math.sin(2 * math.pi * freq_hz * i / rate)))
        for i in range(frames)
    )
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(samples)
    return buf.getvalue()


_FAKE_WAV = _beep_wav()


class FakeTTSProvider(TTSProvider):
    """Offline, deterministic: the same short beep for any text."""

    name = "fake"
    mime = "audio/wav"

    async def synthesize(self, text: str, voice_id: str | None = None) -> bytes:
        return _FAKE_WAV


class GoogleTTSProvider(TTSProvider):
    """Google Cloud Text-to-Speech v1 `text:synthesize` over REST with an API key
    header, MP3 output. Voice name comes from TTS_VOICE_ID (never hard-coded).
    Only used when TTS_PROVIDER=google and TTS_API_KEY are set by the human."""

    name = "google"
    mime = "audio/mpeg"

    def __init__(self, api_key: str, voice_id: str | None, language: str, timeout_s: float) -> None:
        self._api_key = api_key
        self._voice_id = voice_id
        self._language = language
        self._timeout_s = timeout_s

    def _synthesize(self, text: str, voice_id: str | None) -> bytes:
        voice: dict = {"languageCode": self._language}
        if voice_id or self._voice_id:
            voice["name"] = voice_id or self._voice_id
        payload = {
            "input": {"text": text},
            "voice": voice,
            "audioConfig": {"audioEncoding": "MP3"},
        }
        data = post_json(_GOOGLE_TTS_URL, payload, self._api_key, self._timeout_s)
        return base64.b64decode(data.get("audioContent", ""))

    async def synthesize(self, text: str, voice_id: str | None = None) -> bytes:
        return await asyncio.to_thread(self._synthesize, text, voice_id)


def get_tts_provider() -> TTSProvider:
    s = get_settings()
    if s.tts_provider == "google" and s.tts_api_key:
        return GoogleTTSProvider(s.tts_api_key, s.tts_voice_id, s.tts_language, s.tts_timeout_s)
    return FakeTTSProvider()


async def synthesize_timed(
    provider: TTSProvider, text: str, timeout_s: float | None = None
) -> Timed[SynthesizedAudio]:
    """Synthesize with a timeout and measured latency. Raises VoiceProviderError
    (never a raw provider exception); empty audio is also a failure."""
    text = (text or "").strip()
    if not text:
        raise VoiceProviderError("tts", "empty_text")
    timeout = timeout_s if timeout_s is not None else get_settings().tts_timeout_s
    result = await run_timed("tts", provider.name, provider.synthesize(text), timeout)
    if not result.value:
        raise VoiceProviderError("tts", "empty_result")
    return Timed(
        value=SynthesizedAudio(audio=result.value, mime=provider.mime),
        elapsed_ms=result.elapsed_ms,
    )
