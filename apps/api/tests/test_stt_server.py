"""Local STT server HTTP layer (scripts/stt_server/server.py, Slice 17, AVP-136).

The Whisper model is replaced by a fake transcriber, so no model, no faster-whisper
and no network beyond 127.0.0.1. Synthetic bytes and text only.
"""

from __future__ import annotations

import http.client
import importlib.util
import json
import logging
import secrets
import threading
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
_spec = importlib.util.spec_from_file_location(
    "avp_stt_server", REPO_ROOT / "scripts" / "stt_server" / "server.py"
)
server_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(server_mod)

AUDIO = b"\x1aE\xdf\xa3synthetic-webm\r\n--looks-like-a-boundary\x00\xff" * 50
SPOKEN = "Chào chị, bé bị sốt mấy ngày rồi ạ?"


class FakeTranscriber:
    def __init__(self, text: str = f"  {SPOKEN}\n", fail: bool = False) -> None:
        self.text, self.fail = text, fail
        self.calls: list[tuple[bytes, str]] = []

    def __call__(self, audio: bytes, language: str) -> str:
        self.calls.append((audio, language))
        if self.fail:
            raise RuntimeError("decoder exploded with secret detail")
        return self.text


def _start(transcriber, api_key=None):
    srv = server_mod.STTServer(("127.0.0.1", 0), transcriber, "fake-model", api_key)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


@pytest.fixture
def fake():
    return FakeTranscriber()


@pytest.fixture
def srv(fake):
    s = _start(fake)
    yield s
    s.shutdown()
    s.server_close()


def multipart(fields: dict[str, bytes | str]) -> tuple[bytes, str]:
    boundary = "b-" + secrets.token_hex(8)
    out = bytearray()
    for name, value in fields.items():
        data = value.encode() if isinstance(value, str) else value
        extra = '; filename="audio.webm"' if name == "file" else ""
        out += f"--{boundary}\r\n".encode()
        out += f'Content-Disposition: form-data; name="{name}"{extra}\r\n\r\n'.encode()
        out += data + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def request(srv, method="POST", path="/v1/audio/transcriptions", body=b"", headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=10)
    conn.request(method, path, body=body, headers=headers or {})
    resp = conn.getresponse()
    data = resp.read()
    conn.close()
    return resp.status, resp.getheader("Content-Type", ""), data


def post(srv, fields, headers=None):
    body, ctype = multipart(fields)
    return request(srv, body=body, headers={"Content-Type": ctype, **(headers or {})})


# --- happy path --------------------------------------------------------------


def test_health(srv):
    status, _, data = request(srv, "GET", "/health")
    assert status == 200
    assert json.loads(data) == {"status": "ok", "model": "fake-model"}


def test_transcribes_audio_verbatim(srv, fake):
    status, ctype, data = post(srv, {"file": AUDIO, "language": "vi", "response_format": "json"})
    assert status == 200
    assert ctype.startswith("application/json")
    assert json.loads(data) == {"text": SPOKEN}  # whitespace normalised
    assert fake.calls == [(AUDIO, "vi")]  # byte-exact audio, boundary-looking bytes included


def test_language_defaults_to_vi_and_model_field_is_accepted(srv, fake):
    status, _, _ = post(srv, {"model": "small", "file": AUDIO})
    assert status == 200
    assert fake.calls[0][1] == "vi"


def test_text_response_format(srv):
    status, ctype, data = post(srv, {"file": AUDIO, "response_format": "text"})
    assert status == 200
    assert ctype.startswith("text/plain")
    assert data.decode("utf-8") == SPOKEN


# --- bad requests -----------------------------------------------------------


@pytest.mark.parametrize(
    ("fields", "code"),
    [
        ({"language": "vi"}, "missing_file"),
        ({"file": b""}, "missing_file"),
        ({"file": AUDIO, "language": "vi-VN"}, "bad_language"),
        ({"file": AUDIO, "language": "../x"}, "bad_language"),
        ({"file": AUDIO, "response_format": "srt"}, "bad_response_format"),
    ],
)
def test_bad_fields_are_400(srv, fake, fields, code):
    status, _, data = post(srv, fields)
    assert status == 400
    assert json.loads(data)["error"]["code"] == code
    assert fake.calls == []


def test_not_multipart_is_400(srv, fake):
    status, _, data = request(
        srv, body=b'{"file": "x"}', headers={"Content-Type": "application/json"}
    )
    assert status == 400
    assert json.loads(data)["error"]["code"] == "expected_multipart"
    assert fake.calls == []


def test_oversized_audio_is_413(srv, fake):
    status, _, _ = post(srv, {"file": b"\x00" * (server_mod.MAX_AUDIO_BYTES + 1)})
    assert status == 413
    assert fake.calls == []


def test_oversized_body_is_refused_before_reading(srv, fake):
    conn = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=10)
    conn.putrequest("POST", "/v1/audio/transcriptions")
    conn.putheader("Content-Type", "multipart/form-data; boundary=x")
    conn.putheader("Content-Length", str(server_mod.MAX_BODY_BYTES + 1))
    conn.endheaders()  # body never sent: the server must answer without waiting for it
    resp = conn.getresponse()
    assert resp.status == 413
    conn.close()
    assert fake.calls == []


def test_unknown_paths_are_404(srv):
    assert request(srv, "GET", "/v1/audio/transcriptions")[0] == 404
    assert post(srv, {"file": AUDIO})[0] == 200
    body, ctype = multipart({"file": AUDIO})
    assert request(srv, path="/v1/other", body=body, headers={"Content-Type": ctype})[0] == 404


# --- auth, failures, privacy ------------------------------------------------------


def test_api_key_is_required_when_configured(fake):
    s = _start(fake, api_key="k-123")
    try:
        assert post(s, {"file": AUDIO})[0] == 401
        assert post(s, {"file": AUDIO}, {"Authorization": "Bearer nope"})[0] == 401
        assert post(s, {"file": AUDIO}, {"Authorization": "Bearer k-123"})[0] == 200
        assert len(fake.calls) == 1
    finally:
        s.shutdown()
        s.server_close()


def test_transcriber_failure_is_422_without_details(caplog):
    caplog.set_level(logging.DEBUG)
    s = _start(FakeTranscriber(fail=True))
    try:
        status, _, data = post(s, {"file": AUDIO})
    finally:
        s.shutdown()
        s.server_close()
    assert status == 422
    assert json.loads(data)["error"]["code"] == "transcription_failed"
    assert b"secret detail" not in data
    assert "secret detail" not in caplog.text


def test_logs_hold_no_transcript_or_audio(srv, caplog):
    caplog.set_level(logging.DEBUG)
    assert post(srv, {"file": AUDIO})[0] == 200
    assert SPOKEN not in caplog.text
    assert "synthetic-webm" not in caplog.text
    assert "outcome=ok" in caplog.text


def test_default_bind_is_loopback(monkeypatch):
    seen = {}

    class Stop(Exception):
        pass

    def fake_server(address, *args, **kwargs):
        seen["address"] = address
        raise Stop

    monkeypatch.setenv("WHISPER_MODEL", "fake-model")
    monkeypatch.delenv("STT_SERVER_HOST", raising=False)
    monkeypatch.delenv("STT_SERVER_PORT", raising=False)
    monkeypatch.setattr(server_mod, "make_whisper_transcriber", lambda *a: FakeTranscriber())
    monkeypatch.setattr(server_mod, "STTServer", fake_server)
    with pytest.raises(Stop):
        server_mod.main()
    assert seen["address"] == ("127.0.0.1", 8890)


def test_missing_model_exits_with_message(monkeypatch, capsys):
    monkeypatch.delenv("WHISPER_MODEL", raising=False)
    assert server_mod.main() == 2
    assert "WHISPER_MODEL" in capsys.readouterr().err


def test_cuda_dll_dirs_lists_nvidia_wheel_bins(tmp_path):
    sp = tmp_path / "site-packages"
    for lib in ("cudnn", "cublas"):
        (sp / "nvidia" / lib / "bin").mkdir(parents=True)
    (sp / "nvidia" / "no_bin_here").mkdir()
    found = server_mod.cuda_dll_dirs([str(sp), str(tmp_path / "missing")])
    assert found == [str(sp / "nvidia" / "cublas" / "bin"), str(sp / "nvidia" / "cudnn" / "bin")]


def test_warmup_wav_is_a_short_valid_wav():
    import io
    import wave

    with wave.open(io.BytesIO(server_mod._warmup_wav(0.5)), "rb") as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, 16000)
        assert w.getnframes() == 8000
