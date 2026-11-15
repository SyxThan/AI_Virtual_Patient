"""Local speech-to-text server for AVP (Slice 17, AVP-136).

A small, self-hosted Whisper server (faster-whisper) speaking the OpenAI-compatible
`POST /v1/audio/transcriptions` (multipart: `file`, optional `language`, `model`,
`response_format`), answered with `{"text": "..."}`. `apps/api` reaches it through
`WhisperSTTProvider` (STT_PROVIDER=whisper, STT_BASE_URL).

Runs in its own virtualenv (see requirements.txt); it is not part of apps/api.
Listens on 127.0.0.1 by default, so the student's audio never leaves this machine.
It never logs audio or transcripts: only sizes, outcome and elapsed time.

Environment (all optional except the model):
  WHISPER_MODEL          faster-whisper model name or local path (e.g. "small"); required
  WHISPER_DEVICE         cpu | cuda | auto (default cpu)
  WHISPER_COMPUTE_TYPE   e.g. int8, int8_float16, float16 (default int8)
  WHISPER_BEAM_SIZE      default 5
  STT_SERVER_HOST        default 127.0.0.1
  STT_SERVER_PORT        default 8890
  STT_SERVER_API_KEY     if set, requests must send "Authorization: Bearer <key>"
  HF_HOME                where models are downloaded (put it on a roomy drive)

Run:  python server.py        (or: python -m server, from this folder)
"""

from __future__ import annotations

import hmac
import io
import json
import logging
import os
import re
import sys
import threading
import time
from collections.abc import Callable
from email.parser import BytesParser
from email.policy import HTTP
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

logger = logging.getLogger("avp_stt_server")

# Same per-turn cap as apps/api's WebSocket (MAX_AUDIO_BYTES), plus multipart overhead.
MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024
TRANSCRIBE_PATH = "/v1/audio/transcriptions"
_LANGUAGE = re.compile(r"^[a-z]{2,3}$")

# transcribe(audio_bytes, language) -> text. The real one wraps faster-whisper;
# tests inject a fake so they never need the model.
Transcriber = Callable[[bytes, str], str]


class BadRequest(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def parse_multipart(content_type: str, body: bytes) -> dict[str, bytes]:
    """Parse a multipart/form-data body into {field name: raw bytes}."""
    is_multipart = content_type.lower().startswith("multipart/form-data")
    if not is_multipart or "boundary=" not in content_type:
        raise BadRequest("expected_multipart")
    msg = BytesParser(policy=HTTP).parsebytes(
        f"Content-Type: {content_type}\r\n\r\n".encode("latin-1") + body
    )
    if not msg.is_multipart():
        raise BadRequest("expected_multipart")
    fields: dict[str, bytes] = {}
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if isinstance(name, str) and name not in fields:
            fields[name] = part.get_payload(decode=True) or b""
    return fields


def make_whisper_transcriber(
    model: str, device: str = "cpu", compute_type: str = "int8", beam_size: int = 5
) -> Transcriber:
    """Load faster-whisper once; calls are serialised (one model, one turn at a time)."""
    from faster_whisper import WhisperModel  # heavy import, only in the real server

    whisper = WhisperModel(model, device=device, compute_type=compute_type)
    lock = threading.Lock()

    def transcribe(audio: bytes, language: str) -> str:
        with lock:
            segments, _info = whisper.transcribe(
                io.BytesIO(audio), language=language, beam_size=beam_size, vad_filter=True
            )
            return " ".join(s.text.strip() for s in segments if s.text.strip())

    return transcribe


class _Handler(BaseHTTPRequestHandler):
    server_version = "avp-stt"
    sys_version = ""

    # --- helpers -----------------------------------------------------------
    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status: int, code: str) -> None:
        self._send(status, {"error": {"code": code}})

    def _authorized(self) -> bool:
        key = self.server.api_key
        if not key:
            return True
        given = self.headers.get("Authorization", "")
        return hmac.compare_digest(given.encode(), f"Bearer {key}".encode())

    # --- routes ------------------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802 - stdlib name
        if self.path.split("?", 1)[0] == "/health":
            self._send(200, {"status": "ok", "model": self.server.model_name})
        else:
            self._error(404, "not_found")

    def do_POST(self) -> None:  # noqa: N802 - stdlib name
        started = time.perf_counter()
        try:
            length = int(self.headers.get("Content-Length") or "")
        except ValueError:
            self.close_connection = True
            self._error(411, "length_required")
            return
        if length < 0 or length > MAX_BODY_BYTES:
            self.close_connection = True  # do not read an oversized body
            self._error(413, "too_large")
            return
        # Read the (bounded) body before any other answer: replying with unread
        # request bytes makes Windows reset the connection under the client.
        body = self.rfile.read(length)
        if self.path.split("?", 1)[0] != TRANSCRIBE_PATH:
            self._error(404, "not_found")
            return
        if not self._authorized():
            self._error(401, "unauthorized")
            return
        try:
            fields = parse_multipart(self.headers.get("Content-Type", ""), body)
            audio = fields.get("file") or b""
            if not audio:
                raise BadRequest("missing_file")
            if len(audio) > MAX_AUDIO_BYTES:
                raise BadRequest("too_large")
            language = (fields.get("language") or b"vi").decode("ascii", "replace").strip().lower()
            if not _LANGUAGE.match(language):
                raise BadRequest("bad_language")
            fmt = (fields.get("response_format") or b"json").decode("ascii", "replace").strip()
            if fmt not in ("json", "text"):
                raise BadRequest("bad_response_format")
        except BadRequest as exc:
            status = 413 if exc.code == "too_large" else 400
            logger.info("stt outcome=%s bytes=%d", exc.code, length)
            self._error(status, exc.code)
            return

        try:
            text = self.server.transcribe(audio, language)
        except Exception as exc:  # noqa: BLE001 - never echo details (may hold audio info)
            ms = int((time.perf_counter() - started) * 1000)
            logger.warning(
                "stt outcome=error type=%s bytes=%d elapsed_ms=%d",
                type(exc).__name__,
                len(audio),
                ms,
            )
            self._error(422, "transcription_failed")
            return
        ms = int((time.perf_counter() - started) * 1000)
        logger.info("stt outcome=ok bytes=%d elapsed_ms=%d", len(audio), ms)
        text = " ".join((text or "").split())
        if fmt == "text":
            data = text.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self._send(200, {"text": text})

    def log_message(self, *args) -> None:  # request lines are logged by _Handler itself
        pass


class STTServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self,
        address: tuple[str, int],
        transcribe: Transcriber,
        model_name: str,
        api_key: str | None = None,
    ) -> None:
        super().__init__(address, _Handler)
        self.transcribe = transcribe
        self.model_name = model_name
        self.api_key = api_key or None


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    model = os.environ.get("WHISPER_MODEL", "").strip()
    if not model:
        print("WHISPER_MODEL is not set (e.g. set WHISPER_MODEL=small).", file=sys.stderr)
        return 2
    host = os.environ.get("STT_SERVER_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.environ.get("STT_SERVER_PORT", "8890"))
    device = os.environ.get("WHISPER_DEVICE", "cpu").strip() or "cpu"
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8").strip() or "int8"
    beam_size = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))
    logger.info("loading model=%s device=%s compute_type=%s", model, device, compute_type)
    transcribe = make_whisper_transcriber(model, device, compute_type, beam_size)
    server = STTServer((host, port), transcribe, model, os.environ.get("STT_SERVER_API_KEY"))
    logger.info("ready on http://%s:%d (POST %s)", host, port, TRANSCRIBE_PATH)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
