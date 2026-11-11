"""WebSocket voice loop tests (Slice 6-02). Offline fakes, synthetic audio only."""

from __future__ import annotations

import asyncio
import base64
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from avp_api.main import create_app
from avp_api.providers.llm import FakeLLMProvider, LLMProvider
from avp_api.providers.stt import FakeSTTProvider, STTProvider
from avp_api.providers.tts import FakeTTSProvider, TTSProvider
from avp_api.routers import websocket as ws_router
from tests.test_turns import GOOD, SID, FakeSessionRepo, FakeTurnRepo

AUDIO = b"\x1aE\xdf\xa3" + b"\x00" * 256  # synthetic WebM-ish bytes, not speech


class _BoomSTT(STTProvider):
    name = "boom"

    async def transcribe(self, audio_bytes: bytes, language: str = "vi") -> str:
        raise RuntimeError("down")


class _SlowTTS(TTSProvider):
    name = "slow"

    async def synthesize(self, text: str, voice_id: str | None = None) -> bytes:
        await asyncio.sleep(30)
        return b""


class _BoomLLM(LLMProvider):
    def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
        raise RuntimeError("llm down")


def _client(
    turns: FakeTurnRepo,
    stt: STTProvider | None = None,
    tts: TTSProvider | None = None,
    llm: LLMProvider | None = None,
) -> TestClient:
    @contextmanager
    def factory():
        yield FakeSessionRepo(), turns

    app = create_app()
    app.dependency_overrides[ws_router.get_repo_factory] = lambda: factory
    app.dependency_overrides[ws_router.get_ws_llm] = lambda: llm or FakeLLMProvider()
    app.dependency_overrides[ws_router.get_ws_stt] = lambda: stt or FakeSTTProvider()
    app.dependency_overrides[ws_router.get_ws_tts] = lambda: tts or FakeTTSProvider()
    return TestClient(app)


def _auth(ws, token: str = GOOD) -> dict:
    ws.send_json({"type": "auth", "token": token})
    return ws.receive_json()


def _speak(ws, audio: bytes = AUDIO) -> None:
    for i in range(0, len(audio), 100):
        ws.send_bytes(audio[i : i + 100])
    ws.send_json({"type": "end"})


def test_voice_turn_returns_both_transcripts_and_audio() -> None:
    turns = FakeTurnRepo()
    with _client(turns).websocket_connect(f"/ws/sessions/{SID}") as ws:
        assert _auth(ws) == {"type": "ready"}
        _speak(ws)
        student = ws.receive_json()
        patient = ws.receive_json()
        audio = ws.receive_json()
        timing = ws.receive_json()
    assert student == {
        "type": "transcript",
        "speaker": "student",
        "text": FakeSTTProvider.TRANSCRIPT,
    }
    assert patient["speaker"] == "patient" and patient["text"] and patient["turn_idx"] == 1
    assert audio["type"] == "audio" and audio["mime"] == "audio/wav"
    assert base64.b64decode(audio["data"])[:4] == b"RIFF"
    assert timing["type"] == "timing" and timing["stt_ms"] >= 0 and timing["tts_ms"] >= 0
    # Persisted through submit_turn (guardrails + persistence reused, not duplicated).
    assert [(r.idx, r.speaker) for r in turns.rows] == [(0, "student"), (1, "patient")]
    assert turns.rows[0].text == FakeSTTProvider.TRANSCRIPT


def test_wrong_token_is_refused() -> None:
    with _client(FakeTurnRepo()).websocket_connect(f"/ws/sessions/{SID}") as ws:
        ws.send_json({"type": "auth", "token": "nope"})
        with pytest.raises(WebSocketDisconnect) as ei:
            ws.receive_json()
    assert ei.value.code == 1008


def test_first_message_must_be_auth() -> None:
    with _client(FakeTurnRepo()).websocket_connect(f"/ws/sessions/{SID}") as ws:
        ws.send_json({"type": "end"})
        with pytest.raises(WebSocketDisconnect) as ei:
            ws.receive_json()
    assert ei.value.code == 1008


def test_stt_failure_keeps_socket_and_text_still_works() -> None:
    turns = FakeTurnRepo()
    with _client(turns, stt=_BoomSTT()).websocket_connect(f"/ws/sessions/{SID}") as ws:
        _auth(ws)
        _speak(ws)
        err = ws.receive_json()
        assert err["type"] == "error" and err["code"] == "STT_FAILED"
        # Same socket: a typed turn still goes through.
        ws.send_json({"type": "text", "text": "Cháu sốt mấy ngày rồi?"})
        assert ws.receive_json()["speaker"] == "student"
        assert ws.receive_json()["speaker"] == "patient"
        assert ws.receive_json()["type"] == "audio"
    assert len(turns.rows) == 2  # nothing persisted for the failed utterance


def test_tts_timeout_falls_back_to_text(monkeypatch) -> None:
    monkeypatch.setattr(ws_router, "synthesize_timed", _fast_timeout_synth)
    turns = FakeTurnRepo()
    with _client(turns, tts=_SlowTTS()).websocket_connect(f"/ws/sessions/{SID}") as ws:
        _auth(ws)
        _speak(ws)
        assert ws.receive_json()["speaker"] == "student"
        assert ws.receive_json()["speaker"] == "patient"
        err = ws.receive_json()
        assert err == {"type": "error", "code": "TTS_FAILED", "message": err["message"]}
        timing = ws.receive_json()
        assert timing["tts_ms"] is None
        # Socket still usable.
        ws.send_json({"type": "cancel"})
        ws.send_json({"type": "bogus"})
        assert ws.receive_json()["code"] == "BAD_MESSAGE"
    assert len(turns.rows) == 2


async def _fast_timeout_synth(provider, text, timeout_s=None):
    from avp_api.providers import tts

    return await tts.synthesize_timed(provider, text, timeout_s=0.05)


def test_oversized_audio_is_rejected_without_closing(monkeypatch) -> None:
    monkeypatch.setattr(ws_router, "MAX_AUDIO_BYTES", 150)
    turns = FakeTurnRepo()
    with _client(turns).websocket_connect(f"/ws/sessions/{SID}") as ws:
        _auth(ws)
        _speak(ws)  # 260 bytes > 150
        assert ws.receive_json()["code"] == "AUDIO_TOO_LARGE"
        _speak(ws, AUDIO[:120])  # next utterance within the limit works
        assert ws.receive_json()["speaker"] == "student"
        assert ws.receive_json()["speaker"] == "patient"
        assert ws.receive_json()["type"] == "audio"
        assert ws.receive_json()["type"] == "timing"
    assert len(turns.rows) == 2  # only the in-limit utterance became a turn


def test_llm_failure_reports_error_and_keeps_socket() -> None:
    turns = FakeTurnRepo()
    with _client(turns, llm=_BoomLLM()).websocket_connect(f"/ws/sessions/{SID}") as ws:
        _auth(ws)
        _speak(ws)
        assert ws.receive_json()["speaker"] == "student"
        err = ws.receive_json()
        assert err["code"] == "PATIENT_UNAVAILABLE"
        ws.send_json({"type": "bogus"})
        assert ws.receive_json()["code"] == "BAD_MESSAGE"
    assert turns.rows == []


def test_foreign_origin_is_refused() -> None:
    client = _client(FakeTurnRepo())
    with pytest.raises(WebSocketDisconnect) as ei:
        with client.websocket_connect(
            f"/ws/sessions/{SID}", headers={"origin": "https://evil.example"}
        ) as ws:
            ws.receive_json()
    assert ei.value.code == 1008
