"""Voice adapter tests (Slice 6-01). Offline: no network, no keys, synthetic audio."""

from __future__ import annotations

import asyncio
import io
import wave

import pytest

from avp_api.config import Settings
from avp_api.providers import stt, tts
from avp_api.providers.voice_common import VoiceProviderError

SYNTHETIC_AUDIO = b"\x1aE\xdf\xa3" + b"\x00" * 64  # WebM magic + zeros; not real speech


def _settings(**kw) -> Settings:
    return Settings(_env_file=None, **kw)  # ignore any local .env


def _patch_settings(monkeypatch, **kw) -> None:
    s = _settings(**kw)
    monkeypatch.setattr(stt, "get_settings", lambda: s)
    monkeypatch.setattr(tts, "get_settings", lambda: s)


# --- selection -------------------------------------------------------------


def test_defaults_to_fake_without_config(monkeypatch):
    _patch_settings(monkeypatch)
    assert isinstance(stt.get_stt_provider(), stt.FakeSTTProvider)
    assert isinstance(tts.get_tts_provider(), tts.FakeTTSProvider)


def test_provider_without_key_falls_back_to_fake(monkeypatch):
    _patch_settings(monkeypatch, stt_provider="google", tts_provider="google")
    assert isinstance(stt.get_stt_provider(), stt.FakeSTTProvider)
    assert isinstance(tts.get_tts_provider(), tts.FakeTTSProvider)


def test_env_selects_google_when_key_present(monkeypatch):
    _patch_settings(
        monkeypatch,
        stt_provider="google",
        stt_api_key="k-stt",
        tts_provider="google",
        tts_api_key="k-tts",
        tts_voice_id="voice-from-env",
    )
    assert isinstance(stt.get_stt_provider(), stt.GoogleSTTProvider)
    assert isinstance(tts.get_tts_provider(), tts.GoogleTTSProvider)


def test_api_keys_not_in_repr():
    s = _settings(stt_api_key="secret-stt", tts_api_key="secret-tts")
    assert "secret-stt" not in repr(s)
    assert "secret-tts" not in repr(s)


# --- fake round-trip -------------------------------------------------------


def test_fake_stt_round_trip_measures_latency():
    res = asyncio.run(stt.transcribe_timed(stt.FakeSTTProvider(), SYNTHETIC_AUDIO, 1.0))
    assert res.value == stt.FakeSTTProvider.TRANSCRIPT
    assert res.elapsed_ms >= 0


def test_fake_tts_returns_valid_wav():
    res = asyncio.run(tts.synthesize_timed(tts.FakeTTSProvider(), "Dạ cháu sốt ạ.", 1.0))
    assert res.value.mime == "audio/wav"
    assert res.elapsed_ms >= 0
    with wave.open(io.BytesIO(res.value.audio)) as w:
        assert w.getnchannels() == 1
        assert w.getnframes() > 0


# --- typed failures --------------------------------------------------------


class _BoomSTT(stt.STTProvider):
    name = "boom"

    async def transcribe(self, audio_bytes: bytes, language: str = "vi") -> str:
        raise RuntimeError("upstream exploded with key=should-not-leak")


class _SlowTTS(tts.TTSProvider):
    name = "slow"
    mime = "audio/wav"

    async def synthesize(self, text: str, voice_id: str | None = None) -> bytes:
        await asyncio.sleep(5)
        return b"x"


class _SilentSTT(stt.STTProvider):
    name = "silent"

    async def transcribe(self, audio_bytes: bytes, language: str = "vi") -> str:
        return "   "


def test_provider_exception_becomes_typed_error():
    with pytest.raises(VoiceProviderError) as ei:
        asyncio.run(stt.transcribe_timed(_BoomSTT(), SYNTHETIC_AUDIO, 1.0))
    assert ei.value.kind == "stt" and ei.value.reason == "provider_error"
    assert "should-not-leak" not in str(ei.value)


def test_timeout_becomes_typed_error():
    with pytest.raises(VoiceProviderError) as ei:
        asyncio.run(tts.synthesize_timed(_SlowTTS(), "xin chào", 0.05))
    assert ei.value.kind == "tts" and ei.value.reason == "timeout"


def test_empty_inputs_and_results_are_failures():
    with pytest.raises(VoiceProviderError, match="empty_audio"):
        asyncio.run(stt.transcribe_timed(stt.FakeSTTProvider(), b"", 1.0))
    with pytest.raises(VoiceProviderError, match="empty_result"):
        asyncio.run(stt.transcribe_timed(_SilentSTT(), SYNTHETIC_AUDIO, 1.0))
    with pytest.raises(VoiceProviderError, match="empty_text"):
        asyncio.run(tts.synthesize_timed(tts.FakeTTSProvider(), "  ", 1.0))


def test_google_stt_parses_response_without_network(monkeypatch):
    captured = {}

    def fake_post(url, payload, api_key, timeout_s):
        captured.update(url=url, payload=payload, key=api_key)
        return {"results": [{"alternatives": [{"transcript": " cháu sốt "}]}]}

    monkeypatch.setattr(stt, "post_json", fake_post)
    p = stt.GoogleSTTProvider("k", None, "vi-VN", 1.0)
    assert asyncio.run(p.transcribe(SYNTHETIC_AUDIO)) == "cháu sốt"
    assert captured["payload"]["config"]["encoding"] == "WEBM_OPUS"
    assert "k" not in captured["url"]  # key travels in a header, not the URL


def test_google_tts_decodes_audio_without_network(monkeypatch):
    monkeypatch.setattr(tts, "post_json", lambda *a, **k: {"audioContent": "AAEC"})
    p = tts.GoogleTTSProvider("k", "voice-from-env", "vi-VN", 1.0)
    assert asyncio.run(p.synthesize("xin chào")) == b"\x00\x01\x02"
