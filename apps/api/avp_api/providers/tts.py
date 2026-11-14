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
import json
import math
import struct
import urllib.error
import urllib.parse
import urllib.request
import wave
from abc import ABC, abstractmethod
from dataclasses import dataclass

from avp_api.config import get_settings
from avp_api.providers.voice_common import Timed, VoiceProviderError, post_json, run_timed

_GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
# VieNeu resamples on the server; 24 kHz mono s16le keeps a reply small over the
# WebSocket (48 kHz native would double it) and is still clear speech.
VIENEU_SAMPLE_RATE = 24_000
# 2 minutes of 24 kHz s16le mono: far above one patient reply, bounds memory.
_VIENEU_MAX_BYTES = VIENEU_SAMPLE_RATE * 2 * 120


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


def pcm16_to_wav(pcm: bytes, rate: int) -> bytes:
    """Wrap raw s16le mono PCM in a WAV header with the real length, so every
    browser's `decodeAudioData` accepts it (a streamed WAV header has no length)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


class VieNeuTTSProvider(TTSProvider):
    """Self-hosted VieNeu-TTS (Apache-2.0) through its OpenAI-compatible server
    (`POST {TTS_BASE_URL}/v1/audio/speech`, apps/openai_speech.py upstream).

    Asks for headerless PCM at a fixed rate and wraps it in a WAV with the real
    length. The voice is a preset name from TTS_VOICE_ID (unset = server default).
    TTS_API_KEY is optional and only sent when the server sets VIENEU_API_KEY.
    Only used when TTS_PROVIDER=vieneu and TTS_BASE_URL are set by the human."""

    name = "vieneu"
    mime = "audio/wav"

    def __init__(
        self, base_url: str, api_key: str | None, voice_id: str | None, timeout_s: float
    ) -> None:
        self._url = base_url.rstrip("/") + "/v1/audio/speech"
        self._api_key = api_key
        self._voice_id = voice_id
        self._timeout_s = timeout_s

    def _synthesize(self, text: str, voice_id: str | None) -> bytes:
        payload: dict = {
            "input": text,
            "response_format": "pcm",
            "sample_rate": VIENEU_SAMPLE_RATE,
        }
        voice = voice_id or self._voice_id
        if voice:
            payload["voice"] = voice
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        req = urllib.request.Request(
            self._url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout_s) as resp:  # noqa: S310 - scheme checked
                pcm = resp.read(_VIENEU_MAX_BYTES + 1)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"HTTP {exc.code}") from None  # status only, never the body
        if len(pcm) > _VIENEU_MAX_BYTES:
            raise RuntimeError("audio too large")
        if len(pcm) % 2:
            pcm = pcm[:-1]  # s16le: drop a trailing half sample
        if not pcm:
            return b""  # synthesize_timed turns this into empty_result
        return pcm16_to_wav(pcm, VIENEU_SAMPLE_RATE)

    async def synthesize(self, text: str, voice_id: str | None = None) -> bytes:
        return await asyncio.to_thread(self._synthesize, text, voice_id)


def _valid_base_url(url: str | None) -> bool:
    if not url:
        return False
    parts = urllib.parse.urlparse(url)
    return parts.scheme in ("http", "https") and bool(parts.netloc)


def get_tts_provider() -> TTSProvider:
    s = get_settings()
    if s.tts_provider == "google" and s.tts_api_key:
        return GoogleTTSProvider(s.tts_api_key, s.tts_voice_id, s.tts_language, s.tts_timeout_s)
    if s.tts_provider == "vieneu" and _valid_base_url(s.tts_base_url):
        return VieNeuTTSProvider(
            s.tts_base_url or "", s.tts_api_key, s.tts_voice_id, s.tts_timeout_s
        )
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
