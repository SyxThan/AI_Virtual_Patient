"""Self-hosted Whisper STT adapter (Slice 17, AVP-135).

Runs against a tiny local HTTP server that mimics the OpenAI-compatible
`POST /v1/audio/transcriptions` (multipart). No network beyond 127.0.0.1,
no model, synthetic bytes and text only.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from email.parser import BytesParser
from email.policy import HTTP
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from avp_api.config import Settings
from avp_api.providers import stt
from avp_api.providers.voice_common import VoiceProviderError

AUDIO = b"\x1aE\xdf\xa3synthetic-webm-not-speech\r\n--not-a-boundary\x00\xff" * 40
SPOKEN = "Chào chị, bé bị sốt mấy ngày rồi ạ?"


def _parse_multipart(content_type: str, body: bytes) -> dict[str, bytes]:
    msg = BytesParser(policy=HTTP).parsebytes(
        f"Content-Type: {content_type}\r\n\r\n".encode() + body
    )
    return {
        part.get_param("name", header="content-disposition"): part.get_payload(decode=True)
        for part in msg.iter_parts()
    }


class _Handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 - stdlib name
        srv = self.server
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        srv.seen.append(
            {
                "path": self.path,
                "auth": self.headers.get("Authorization"),
                "fields": _parse_multipart(self.headers.get("Content-Type", ""), raw),
            }
        )
        if srv.delay_s:
            time.sleep(srv.delay_s)
        body = srv.body if srv.status == 200 else b'{"error":{"message":"secret echo"}}'
        self.send_response(srv.status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # keep test output quiet
        pass


@pytest.fixture
def server():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    srv.seen, srv.status, srv.delay_s = [], 200, 0.0
    srv.body = json.dumps({"text": f"  {SPOKEN}\n "}).encode()
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield srv
    srv.shutdown()
    srv.server_close()


def _url(srv) -> str:
    return f"http://127.0.0.1:{srv.server_address[1]}/"


def _patch(monkeypatch, **kw) -> Settings:
    s = Settings(_env_file=None, **kw)
    monkeypatch.setattr(stt, "get_settings", lambda: s)
    return s


def _provider(srv, **kw) -> stt.WhisperSTTProvider:
    args = {"api_key": None, "model": None, "language": "vi-VN", "timeout_s": 5.0} | kw
    return stt.WhisperSTTProvider(_url(srv), **args)


# --- selection -------------------------------------------------------------


def test_env_selects_whisper_with_base_url(monkeypatch):
    _patch(monkeypatch, stt_provider="whisper", stt_base_url="http://127.0.0.1:8890")
    p = stt.get_stt_provider()
    assert isinstance(p, stt.WhisperSTTProvider)
    assert p.name == "whisper"


@pytest.mark.parametrize("url", [None, "", "127.0.0.1:8890", "ftp://h/", "file:///etc/x"])
def test_whisper_without_valid_base_url_falls_back_to_fake(monkeypatch, url):
    _patch(monkeypatch, stt_provider="whisper", stt_base_url=url)
    assert isinstance(stt.get_stt_provider(), stt.FakeSTTProvider)


def test_google_selection_unchanged(monkeypatch):
    _patch(monkeypatch, stt_provider="google", stt_api_key="k")
    assert isinstance(stt.get_stt_provider(), stt.GoogleSTTProvider)
    _patch(monkeypatch)
    assert isinstance(stt.get_stt_provider(), stt.FakeSTTProvider)


def test_api_key_is_not_in_settings_repr():
    s = Settings(_env_file=None, stt_provider="whisper", stt_api_key="super-secret-key")
    assert "super-secret-key" not in repr(s)


# --- request shape ---------------------------------------------------------


def test_sends_audio_verbatim_as_multipart(server):
    text = asyncio.run(_provider(server).transcribe(AUDIO))
    assert text == SPOKEN  # whitespace normalised
    (req,) = server.seen
    assert req["path"] == "/v1/audio/transcriptions"
    assert req["fields"]["file"] == AUDIO  # byte-exact, boundary-looking bytes included
    assert req["fields"]["language"] == b"vi"  # vi-VN -> ISO-639-1
    assert req["fields"]["response_format"] == b"json"
    assert "model" not in req["fields"]
    assert req["auth"] is None  # no key, no header


def test_model_and_key_are_sent_when_set(server):
    asyncio.run(_provider(server, model="small", api_key="k-123").transcribe(AUDIO))
    (req,) = server.seen
    assert req["fields"]["model"] == b"small"
    assert req["auth"] == "Bearer k-123"


def test_base_url_with_path_and_trailing_slash(server):
    p = stt.WhisperSTTProvider(_url(server) + "/", None, None, "vi", 5.0)
    asyncio.run(p.transcribe(AUDIO))
    assert server.seen[0]["path"] == "/v1/audio/transcriptions"


@pytest.mark.parametrize(("given", "sent"), [("vi-VN", "vi"), ("EN-us", "en"), ("vi", "vi")])
def test_language_code(given, sent):
    assert stt._iso_language(given) == sent


# --- failures --------------------------------------------------------------


def _timed(provider, timeout_s: float = 5.0):
    return asyncio.run(stt.transcribe_timed(provider, AUDIO, timeout_s=timeout_s))


def test_timed_ok_reports_elapsed(server):
    result = _timed(_provider(server))
    assert result.value == SPOKEN
    assert result.elapsed_ms >= 0


def test_http_error_is_typed_and_leaks_nothing(server, caplog):
    server.status = 500
    caplog.set_level(logging.DEBUG)
    with pytest.raises(VoiceProviderError) as exc:
        _timed(_provider(server, api_key="k-123"))
    assert exc.value.reason == "provider_error"
    for leak in ("secret echo", "k-123", SPOKEN):
        assert leak not in str(exc.value)
        assert leak not in caplog.text


@pytest.mark.parametrize(
    "body", [b"not json", b"[]", b'{"text": 5}', b'{"segments": []}', b"\xff\xfe"]
)
def test_malformed_response_is_provider_error(server, body):
    server.body = body
    with pytest.raises(VoiceProviderError) as exc:
        _timed(_provider(server))
    assert exc.value.reason == "provider_error"


def test_blank_transcript_is_empty_result(server):
    server.body = b'{"text": "   "}'
    with pytest.raises(VoiceProviderError) as exc:
        _timed(_provider(server))
    assert exc.value.reason == "empty_result"


def test_oversized_response_is_rejected(server):
    server.body = json.dumps({"text": "a" * (300 * 1024)}).encode()
    with pytest.raises(VoiceProviderError):
        _timed(_provider(server))


def test_slow_server_times_out(server):
    server.delay_s = 1.0
    with pytest.raises(VoiceProviderError) as exc:
        _timed(_provider(server), timeout_s=0.2)
    assert exc.value.reason == "timeout"


def test_server_down_is_provider_error():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    port = srv.server_address[1]
    srv.server_close()  # nothing listens on this port any more
    p = stt.WhisperSTTProvider(f"http://127.0.0.1:{port}", None, None, "vi", 2.0)
    with pytest.raises(VoiceProviderError) as exc:
        _timed(p)
    assert exc.value.reason == "provider_error"


def test_empty_audio_never_reaches_server(server):
    with pytest.raises(VoiceProviderError) as exc:
        asyncio.run(stt.transcribe_timed(_provider(server), b"", timeout_s=5.0))
    assert exc.value.reason == "empty_audio"
    assert server.seen == []
