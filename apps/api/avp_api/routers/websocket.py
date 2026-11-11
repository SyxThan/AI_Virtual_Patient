"""Voice/text turn loop over WebSocket: /ws/sessions/{session_id} (Slice 6-02).

Protocol (docs/specs/openapi.yaml x-websocket, voice-pipeline skill):
  client -> {"type": "auth", "access_token": "<Supabase JWT>"}  (signed in) or
            {"type": "auth", "token": "<guest token>"}          (guest; first message, never URL)
  server -> {"type": "ready"}
  client -> binary audio chunks (audio/webm;codecs=opus) ... then {"type": "end"}
            or {"type": "text", "text": "..."} for a typed turn,
            or {"type": "cancel"} to drop the buffered audio.
  server -> {"type": "transcript", "speaker": "student", "text"}
            {"type": "transcript", "speaker": "patient", "text", "turn_idx"}
            {"type": "audio", "data": "<base64>", "mime"}
            {"type": "timing", "stt_ms", "llm_ms", "tts_ms"}   (measured, never invented)
            {"type": "error", "code", "message"}               (socket stays open)

The middle of every turn is `turns_service.submit_turn`, which owns the Patient
Agent guardrails and persistence; voice only adds STT before and TTS after it.
Any STT/TTS failure degrades to text and keeps the socket open.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.concurrency import run_in_threadpool

from avp_api.auth import TokenVerifier, get_verifier
from avp_api.config import get_settings
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.repositories.turn_repo import SqlTurnRepository, TurnRepository
from avp_api.providers.llm import LLMProvider, get_llm_provider
from avp_api.providers.stt import STTProvider, get_stt_provider, transcribe_timed
from avp_api.providers.tts import TTSProvider, get_tts_provider, synthesize_timed
from avp_api.providers.voice_common import VoiceProviderError
from avp_api.services import session_service, turns_service

logger = logging.getLogger("avp_api.ws")
router = APIRouter(tags=["voice"])

MAX_AUDIO_BYTES = 5 * 1024 * 1024  # per turn (voice-pipeline skill: DoS guard)
AUTH_TIMEOUT_S = 10.0

Repos = tuple[SessionRepository, TurnRepository]
RepoFactory = Callable[[], AbstractContextManager[Repos]]

# Vietnamese, student-facing; codes are stable for the client.
_MSG = {
    "STT_FAILED": "Không nhận diện được giọng nói. Bạn hãy nói lại hoặc gõ câu hỏi.",
    "TTS_FAILED": "Không phát được giọng người mẹ; câu trả lời hiển thị dạng chữ.",
    "AUDIO_TOO_LARGE": "Đoạn ghi âm quá dài. Bạn hãy nói ngắn hơn.",
    "BAD_MESSAGE": "Tin nhắn không hợp lệ.",
    "PATIENT_UNAVAILABLE": "Người bệnh tạm thời không phản hồi được, vui lòng thử lại.",
}


@contextmanager
def _sql_repos() -> Iterator[Repos]:
    # Imported lazily so tests that override the factory never need DATABASE_URL.
    from avp_api.db.session import _maker

    with _maker()() as db:
        yield SqlSessionRepository(db), SqlTurnRepository(db)


def get_repo_factory() -> RepoFactory:
    return _sql_repos


def get_ws_llm() -> LLMProvider:
    return get_llm_provider()


def get_ws_stt() -> STTProvider:
    return get_stt_provider()


def get_ws_tts() -> TTSProvider:
    return get_tts_provider()


def _origin_allowed(ws: WebSocket) -> bool:
    # Browsers always send Origin on WS; CORS does not protect WebSockets.
    origin = ws.headers.get("origin")
    return origin is None or origin in get_settings().cors_origins


async def _send_error(ws: WebSocket, code: str, message: str | None = None) -> None:
    await ws.send_json({"type": "error", "code": code, "message": message or _MSG[code]})


def _http_error_code(exc: HTTPException) -> tuple[str, str]:
    d = exc.detail if isinstance(exc.detail, dict) else {}
    return str(d.get("code", "TURN_FAILED")), str(d.get("message", _MSG["PATIENT_UNAVAILABLE"]))


@router.websocket("/ws/sessions/{session_id}")
async def voice_session(
    ws: WebSocket,
    session_id: str,
    repo_factory: RepoFactory = Depends(get_repo_factory),
    llm: LLMProvider = Depends(get_ws_llm),
    stt: STTProvider = Depends(get_ws_stt),
    tts: TTSProvider = Depends(get_ws_tts),
    verifier: TokenVerifier = Depends(get_verifier),
) -> None:
    if not _origin_allowed(ws):
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await ws.accept()

    # --- auth: first message; JWT (ADR-0008) or guest token, then the shared
    # ownership check in session_service (a foreign session is refused like a miss).
    user_id: str | None = None
    guest_token: str | None = None
    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout=AUTH_TIMEOUT_S)
        if not isinstance(first, dict) or first.get("type") != "auth":
            raise ValueError("bad auth message")
        access_token, token = first.get("access_token"), first.get("token")
        if isinstance(access_token, str) and access_token:
            user_id = await run_in_threadpool(verifier.verify, access_token)
            # An unclaimed guest session stays reachable with its guest token too.
            guest_token = str(token) if isinstance(token, str) and token else None
        elif isinstance(token, str) and token:
            guest_token = token
        else:
            raise ValueError("bad auth message")

        def _check() -> None:
            with repo_factory() as (session_repo, _):
                session_service.get_session(session_id, session_repo, user_id, guest_token)

        await run_in_threadpool(_check)
    except WebSocketDisconnect:
        return
    except Exception:  # noqa: BLE001 - timeout, bad JSON, bad JWT, 404 miss: all refused
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)  # never echo the token
        return
    await ws.send_json({"type": "ready"})

    async def run_turn(text: str, stt_ms: int | None) -> None:
        def _submit():
            with repo_factory() as (session_repo, turn_repo):
                return turns_service.submit_turn(
                    session_id, text, session_repo, turn_repo, llm, user_id, guest_token
                )

        t0 = time.perf_counter()
        try:
            reply = await run_in_threadpool(_submit)
        except HTTPException as exc:
            await _send_error(ws, *_http_error_code(exc))
            return
        llm_ms = int((time.perf_counter() - t0) * 1000)
        await ws.send_json(
            {
                "type": "transcript",
                "speaker": "patient",
                "text": reply.text,
                "turn_idx": reply.turn_idx,
            }
        )
        tts_ms: int | None = None
        try:
            spoken = await synthesize_timed(tts, reply.text)
            tts_ms = spoken.elapsed_ms
            await ws.send_json(
                {
                    "type": "audio",
                    "data": base64.b64encode(spoken.value.audio).decode("ascii"),
                    "mime": spoken.value.mime,
                }
            )
        except VoiceProviderError:
            await _send_error(ws, "TTS_FAILED")  # text reply already delivered
        await ws.send_json({"type": "timing", "stt_ms": stt_ms, "llm_ms": llm_ms, "tts_ms": tts_ms})

    buffer = bytearray()
    overflow = False
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                return
            chunk = msg.get("bytes")
            if chunk is not None:
                if overflow:
                    continue
                if len(buffer) + len(chunk) > MAX_AUDIO_BYTES:
                    buffer.clear()
                    overflow = True
                    await _send_error(ws, "AUDIO_TOO_LARGE")
                    continue
                buffer.extend(chunk)
                continue

            try:
                ctrl = json.loads(msg.get("text") or "")
                kind = ctrl.get("type") if isinstance(ctrl, dict) else None
            except ValueError:
                kind = None

            if kind == "end":
                audio = bytes(buffer)
                buffer.clear()
                if overflow:
                    overflow = False
                    continue
                try:
                    heard = await transcribe_timed(stt, audio)
                except VoiceProviderError:
                    await _send_error(ws, "STT_FAILED")
                    continue
                await ws.send_json(
                    {"type": "transcript", "speaker": "student", "text": heard.value}
                )
                await run_turn(heard.value, heard.elapsed_ms)
            elif kind == "text":
                text = str(ctrl.get("text") or "")
                await ws.send_json({"type": "transcript", "speaker": "student", "text": text})
                await run_turn(text, None)
            elif kind == "cancel":
                buffer.clear()
                overflow = False
            else:
                await _send_error(ws, "BAD_MESSAGE")
    except WebSocketDisconnect:
        return
    except Exception:  # noqa: BLE001 - never leak internals; log type only
        logger.exception("ws session loop failed")
        await ws.close(code=status.WS_1011_INTERNAL_ERROR)
