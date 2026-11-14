"""VieNeu-TTS adapter (Slice 16, AVP-132).

Runs against a tiny local HTTP server that mimics VieNeu's OpenAI-compatible
`POST /v1/audio/speech` (headerless s16le PCM). No network beyond 127.0.0.1,
no model, synthetic text only.
"""

from __future__ import annotations

import asyncio
import io
import json
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from avp_api.config import Settings
from avp_api.providers import tts
from avp_api.providers.voice_common import VoiceProviderError

PCM = b"\x01\x00\xff\x7f" * 1200  # 2400 synthetic samples, not speech


class _Handler(BaseHTTPRequestHandler):
    # Set per test through the server object.
    def do_POST(self):  # noqa: N802 - stdlib name
        srv = self.server
        length = int(self.headers.get("Content-Length") or 0)
        srv.seen.append(
            {
                "path": self.path,
                "auth": self.headers.get("Authorization"),
                "body": json.loads(self.rfile.read(length) or b"{}"),
            }
        )
        if srv.delay_s:
            time.sleep(srv.delay_s)
        self.send_response(srv.status)
        self.send_header("Content-Type", "audio/pcm" if srv.status == 200 else "application/json")
        body = srv.body if srv.status == 200 else b'{"error":{"message":"secret echo"}}'
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # keep test output quiet
        pass


@pytest.fixture
def server():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    srv.seen, srv.status, srv.body, srv.delay_s = [], 200, PCM, 0.0
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield srv
    srv.shutdown()
    srv.server_close()


def _url(srv) -> str:
    return f"http://127.0.0.1:{srv.server_address[1]}/"


def _patch(monkeypatch, **kw) -> None:
    s = Settings(_env_file=None, **kw)
    monkeypatch.setattr(tts, "get_settings", lambda: s)


# --- selection -------------------------------------------------------------


def test_env_selects_vieneu_with_base_url(monkeypatch):
    _patch(monkeypatch, tts_provider="vieneu", tts_base_url="http://127.0.0.1:8880")
    p = tts.get_tts_provider()
    assert isinstance(p, tts.VieNeuTTSProvider)
    assert p.mime == "audio/wav"


@pytest.mark.parametrize("url", [None, "", "127.0.0.1:8880", "file:///etc/passwd", "ftp://x"])
def test_vieneu_without_valid_base_url_falls_back_to_fake(monkeypatch, url):
    _patch(monkeypatch, tts_provider="vieneu", tts_base_url=url)
    assert isinstance(tts.get_tts_provider(), tts.FakeTTSProvider)


def test_google_selection_unchanged(monkeypatch):
    _patch(monkeypatch, tts_provider="google", tts_api_key="k", tts_base_url="http://x:1")
    assert isinstance(tts.get_tts_provider(), tts.GoogleTTSProvider)


# --- request / response ----------------------------------------------------


def test_request_shape_and_valid_wav(server):
    p = tts.VieNeuTTSProvider(_url(server), None, "Giọng thử", 5.0)
    out = asyncio.run(p.synthesize("xin chào"))

    req = server.seen[0]
    assert req["path"] == "/v1/audio/speech"  # trailing slash in base URL handled
    assert req["body"] == {
        "input": "xin chào",
        "response_format": "pcm",
        "sample_rate": tts.VIENEU_SAMPLE_RATE,
        "voice": "Giọng thử",
    }
    assert req["auth"] is None  # no key configured: no header
    with wave.open(io.BytesIO(out)) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (
            1,
            2,
            tts.VIENEU_SAMPLE_RATE,
        )
        assert w.getnframes() == len(PCM) // 2
        assert w.readframes(w.getnframes()) == PCM


def test_no_voice_lets_server_choose_and_key_goes_in_header(server):
    p = tts.VieNeuTTSProvider(_url(server), "local-key", None, 5.0)
    asyncio.run(p.synthesize("xin chào"))
    req = server.seen[0]
    assert "voice" not in req["body"]
    assert req["auth"] == "Bearer local-key"


def test_per_call_voice_overrides_env_voice(server):
    p = tts.VieNeuTTSProvider(_url(server), None, "env voice", 5.0)
    asyncio.run(p.synthesize("xin chào", voice_id="call voice"))
    assert server.seen[0]["body"]["voice"] == "call voice"


def test_odd_byte_count_is_trimmed_to_whole_samples(server):
    server.body = PCM + b"\x05"
    out = asyncio.run(tts.VieNeuTTSProvider(_url(server), None, None, 5.0).synthesize("a"))
    with wave.open(io.BytesIO(out)) as w:
        assert w.getnframes() == len(PCM) // 2


# --- failures stay typed and never leak --------------------------------------


def test_http_error_is_typed_and_hides_body(server):
    server.status = 400
    p = tts.VieNeuTTSProvider(_url(server), "local-key", None, 5.0)
    with pytest.raises(VoiceProviderError) as ei:
        asyncio.run(tts.synthesize_timed(p, "xin chào", timeout_s=5.0))
    assert ei.value.reason == "provider_error"
    assert "secret echo" not in str(ei.value)
    assert "local-key" not in str(ei.value)
    assert "secret echo" not in str(ei.value.__cause__)


def test_empty_audio_is_a_failure(server):
    server.body = b""
    p = tts.VieNeuTTSProvider(_url(server), None, None, 5.0)
    with pytest.raises(VoiceProviderError) as ei:
        asyncio.run(tts.synthesize_timed(p, "xin chào", timeout_s=5.0))
    assert ei.value.reason == "empty_result"


def test_oversized_audio_is_a_failure(server, monkeypatch):
    monkeypatch.setattr(tts, "_VIENEU_MAX_BYTES", 100)
    p = tts.VieNeuTTSProvider(_url(server), None, None, 5.0)
    with pytest.raises(VoiceProviderError) as ei:
        asyncio.run(tts.synthesize_timed(p, "xin chào", timeout_s=5.0))
    assert ei.value.reason == "provider_error"


def test_slow_server_times_out(server):
    server.delay_s = 1.0
    p = tts.VieNeuTTSProvider(_url(server), None, None, 5.0)
    with pytest.raises(VoiceProviderError) as ei:
        asyncio.run(tts.synthesize_timed(p, "xin chào", timeout_s=0.2))
    assert ei.value.reason == "timeout"


def test_server_down_is_typed(server):
    url = _url(server)
    server.shutdown()
    server.server_close()
    p = tts.VieNeuTTSProvider(url, None, None, 2.0)
    with pytest.raises(VoiceProviderError) as ei:
        asyncio.run(tts.synthesize_timed(p, "xin chào", timeout_s=3.0))
    assert ei.value.reason == "provider_error"
