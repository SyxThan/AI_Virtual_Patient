"""Text-to-speech adapter (Slice 6, ADR-0006).

Mirrors providers/llm.py: one interface, an offline `FakeTTSProvider` (a short
synthetic WAV beep, no network, no key), one real provider selected by env, and
`get_tts_provider()` which falls back to the Fake when nothing is configured.
Callers use `synthesize_timed()` (whole reply) or `stream_timed()` (audio parts
as they are synthesized, AVP-167) for measured latency and typed failures. Both
go through an in-process LRU keyed by (provider, voice, text), so a repeated
line (a tier-3 fallback line, a repeated short answer) is synthesized once.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import math
import struct
import threading
import time
import urllib.error
import urllib.request
import wave
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass

from avp_api.config import get_settings
from avp_api.providers.cache import BoundedLRU
from avp_api.providers.voice_common import (
    Timed,
    VoiceProviderError,
    logger,
    post_json,
    run_timed,
    valid_base_url,
)

_GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
# VieNeu resamples on the server; 24 kHz mono s16le keeps a reply small over the
# WebSocket (48 kHz native would double it) and is still clear speech.
VIENEU_SAMPLE_RATE = 24_000
# 2 minutes of 24 kHz s16le mono: far above one patient reply, bounds memory.
_VIENEU_MAX_BYTES = VIENEU_SAMPLE_RATE * 2 * 120
# Streaming (AVP-167): the first part goes out once ~0.25 s of audio exists. Each
# later part holds about as much audio as was already sent (0.25, 0.25, 0.5, 1 s,
# then 1 s each): while the client plays what it has, the next part is made, so
# playback never runs dry, and a reply is a handful of messages, not dozens.
FIRST_PART_BYTES = VIENEU_SAMPLE_RATE * 2 // 4
NEXT_PART_BYTES = VIENEU_SAMPLE_RATE * 2
# TTS cache: at most 128 replies and 32 MB (a 7 s reply is about 340 KB of WAV).
_CACHE_MAX_ENTRIES = 128
_CACHE_MAX_BYTES = 32 * 1024 * 1024


@dataclass(frozen=True)
class SynthesizedAudio:
    audio: bytes
    mime: str  # e.g. "audio/wav", "audio/mpeg"


class TTSProvider(ABC):
    name: str = "unknown"
    mime: str = "application/octet-stream"
    # Real providers opt in; the fake beep and test doubles are never cached.
    cacheable: bool = False

    @abstractmethod
    async def synthesize(self, text: str, voice_id: str | None = None) -> bytes:
        """Synthesize text into audio bytes (format given by `mime`)."""

    @property
    def voice_key(self) -> str | None:
        """The configured voice, part of the cache key (None = provider default)."""
        return None

    async def stream(self, text: str, voice_id: str | None = None) -> AsyncIterator[bytes]:
        """Audio parts in play order, each a complete file of `mime`. Default: the
        whole reply as one part (a provider without streaming)."""
        yield await self.synthesize(text, voice_id)

    def join_parts(self, parts: list[bytes]) -> bytes:
        """Join streamed parts into one file of `mime` (what the cache stores)."""
        return parts[0] if len(parts) == 1 else b"".join(parts)


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
    cacheable = True

    def __init__(self, api_key: str, voice_id: str | None, language: str, timeout_s: float) -> None:
        self._api_key = api_key
        self._voice_id = voice_id
        self._language = language
        self._timeout_s = timeout_s

    @property
    def voice_key(self) -> str | None:
        return self._voice_id

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


def wav_frames(wav: bytes) -> bytes:
    """The raw PCM frames of a WAV file."""
    with wave.open(io.BytesIO(wav), "rb") as w:
        return w.readframes(w.getnframes())


class VieNeuTTSProvider(TTSProvider):
    """Self-hosted VieNeu-TTS (Apache-2.0) through its OpenAI-compatible server
    (`POST {TTS_BASE_URL}/v1/audio/speech`, apps/openai_speech.py upstream).

    Asks for headerless PCM at a fixed rate and wraps it in a WAV with the real
    length. The server streams that PCM while it synthesizes, so `stream()` hands
    out WAV parts before the reply is finished (AVP-167). The voice is a preset
    name from TTS_VOICE_ID (unset = server default). TTS_API_KEY is optional and
    only sent when the server sets VIENEU_API_KEY.
    Only used when TTS_PROVIDER=vieneu and TTS_BASE_URL are set by the human."""

    name = "vieneu"
    mime = "audio/wav"
    cacheable = True

    def __init__(
        self, base_url: str, api_key: str | None, voice_id: str | None, timeout_s: float
    ) -> None:
        self._url = base_url.rstrip("/") + "/v1/audio/speech"
        self._api_key = api_key
        self._voice_id = voice_id
        self._timeout_s = timeout_s

    @property
    def voice_key(self) -> str | None:
        return self._voice_id

    def _request(self, text: str, voice_id: str | None) -> urllib.request.Request:
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
        return urllib.request.Request(
            self._url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
        )

    def _synthesize(self, text: str, voice_id: str | None) -> bytes:
        req = self._request(text, voice_id)
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

    def _pcm_parts(self, text: str, voice_id: str | None, stop: threading.Event) -> Iterator[bytes]:
        """Blocking: read the chunked PCM body as it arrives and cut it into
        whole-sample parts (the first small, each next one about as long as all
        audio sent so far, capped at NEXT_PART_BYTES)."""
        req = self._request(text, voice_id)
        total = 0
        sent = 0
        pending = bytearray()
        threshold = FIRST_PART_BYTES
        try:
            with urllib.request.urlopen(req, timeout=self._timeout_s) as resp:  # noqa: S310 - scheme checked
                while not stop.is_set():
                    chunk = resp.read1(65536)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > _VIENEU_MAX_BYTES:
                        raise RuntimeError("audio too large")
                    pending.extend(chunk)
                    if len(pending) >= threshold:
                        cut = len(pending) - len(pending) % 2
                        yield bytes(pending[:cut])
                        del pending[:cut]
                        sent += cut
                        threshold = max(FIRST_PART_BYTES, min(NEXT_PART_BYTES, sent))
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"HTTP {exc.code}") from None  # status only, never the body
        if stop.is_set():
            return
        cut = len(pending) - len(pending) % 2  # s16le: drop a trailing half sample
        if cut:
            yield bytes(pending[:cut])

    async def stream(self, text: str, voice_id: str | None = None) -> AsyncIterator[bytes]:
        """WAV parts while VieNeu is still synthesizing. The blocking HTTP read
        runs on a worker thread; closing this generator tells it to stop."""
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[tuple[str, object]] = asyncio.Queue()
        stop = threading.Event()

        def put(kind: str, item: object) -> None:
            if not loop.is_closed():
                loop.call_soon_threadsafe(queue.put_nowait, (kind, item))

        def pump() -> None:
            try:
                for pcm in self._pcm_parts(text, voice_id, stop):
                    put("part", pcm)
            except Exception as exc:  # noqa: BLE001 - handed to the consumer
                put("error", exc)
            else:
                put("done", None)

        threading.Thread(target=pump, name="vieneu-stream", daemon=True).start()
        try:
            while True:
                kind, item = await queue.get()
                if kind == "done":
                    return
                if kind == "error":
                    assert isinstance(item, Exception)
                    raise item
                assert isinstance(item, bytes)
                yield pcm16_to_wav(item, VIENEU_SAMPLE_RATE)
        finally:
            stop.set()  # consumer gone (timeout, socket closed): stop reading

    def join_parts(self, parts: list[bytes]) -> bytes:
        if len(parts) == 1:
            return parts[0]
        return pcm16_to_wav(b"".join(wav_frames(p) for p in parts), VIENEU_SAMPLE_RATE)


def get_tts_provider() -> TTSProvider:
    s = get_settings()
    if s.tts_provider == "google" and s.tts_api_key:
        return GoogleTTSProvider(s.tts_api_key, s.tts_voice_id, s.tts_language, s.tts_timeout_s)
    if s.tts_provider == "vieneu" and valid_base_url(s.tts_base_url):
        return VieNeuTTSProvider(
            s.tts_base_url or "", s.tts_api_key, s.tts_voice_id, s.tts_timeout_s
        )
    return FakeTTSProvider()


CacheKey = tuple[str, str | None, str]
_cache: BoundedLRU[CacheKey, bytes] = BoundedLRU(_CACHE_MAX_ENTRIES, _CACHE_MAX_BYTES, size_of=len)


def tts_cache() -> BoundedLRU[CacheKey, bytes]:
    """The process-wide TTS cache (exposed for tests and stats)."""
    return _cache


def _cache_key(provider: TTSProvider, text: str) -> CacheKey | None:
    return (provider.name, provider.voice_key, text) if provider.cacheable else None


async def synthesize_timed(
    provider: TTSProvider, text: str, timeout_s: float | None = None
) -> Timed[SynthesizedAudio]:
    """Synthesize with a timeout and measured latency. Raises VoiceProviderError
    (never a raw provider exception); empty audio is also a failure. A cached
    line is returned without calling the provider (its elapsed_ms is the lookup)."""
    text = (text or "").strip()
    if not text:
        raise VoiceProviderError("tts", "empty_text")
    key = _cache_key(provider, text)
    started = time.perf_counter()
    if key is not None and (hit := _cache.get(key)) is not None:
        ms = int((time.perf_counter() - started) * 1000)
        return Timed(value=SynthesizedAudio(audio=hit, mime=provider.mime), elapsed_ms=ms)
    timeout = timeout_s if timeout_s is not None else get_settings().tts_timeout_s
    result = await run_timed("tts", provider.name, provider.synthesize(text), timeout)
    if not result.value:
        raise VoiceProviderError("tts", "empty_result")
    if key is not None:
        _cache.put(key, result.value)
    return Timed(
        value=SynthesizedAudio(audio=result.value, mime=provider.mime),
        elapsed_ms=result.elapsed_ms,
    )


async def stream_timed(
    provider: TTSProvider, text: str, timeout_s: float | None = None
) -> AsyncIterator[Timed[SynthesizedAudio]]:
    """Audio parts in play order; each part's `elapsed_ms` is measured from the
    start of synthesis. The whole stream shares one deadline. Every failure is a
    VoiceProviderError; a stream that yields nothing is `empty_result`. Only a
    complete stream is cached; a cached line comes back as a single part."""
    text = (text or "").strip()
    if not text:
        raise VoiceProviderError("tts", "empty_text")
    key = _cache_key(provider, text)
    started = time.perf_counter()

    def ms() -> int:
        return int((time.perf_counter() - started) * 1000)

    if key is not None and (hit := _cache.get(key)) is not None:
        yield Timed(value=SynthesizedAudio(audio=hit, mime=provider.mime), elapsed_ms=ms())
        return
    timeout = timeout_s if timeout_s is not None else get_settings().tts_timeout_s
    deadline = started + timeout
    parts: list[bytes] = []
    gen = provider.stream(text)
    try:
        while True:
            try:
                remaining = deadline - time.perf_counter()
                if remaining <= 0:
                    raise TimeoutError
                part = await asyncio.wait_for(anext(gen), timeout=remaining)
            except StopAsyncIteration:
                break
            except TimeoutError as exc:
                logger.warning("tts provider=%s outcome=timeout elapsed_ms=%d", provider.name, ms())
                raise VoiceProviderError("tts", "timeout") from exc
            except VoiceProviderError:
                raise
            except Exception as exc:  # noqa: BLE001 - any provider failure must become typed
                logger.warning(
                    "tts provider=%s outcome=error type=%s elapsed_ms=%d",
                    provider.name,
                    type(exc).__name__,
                    ms(),
                )
                raise VoiceProviderError("tts", "provider_error") from exc
            if not part:
                continue
            parts.append(part)
            yield Timed(value=SynthesizedAudio(audio=part, mime=provider.mime), elapsed_ms=ms())
    finally:
        await gen.aclose()  # type: ignore[attr-defined]
    if not parts:
        raise VoiceProviderError("tts", "empty_result")
    logger.info(
        "tts provider=%s outcome=ok parts=%d elapsed_ms=%d", provider.name, len(parts), ms()
    )
    if key is not None:
        _cache.put(key, provider.join_parts(parts))
