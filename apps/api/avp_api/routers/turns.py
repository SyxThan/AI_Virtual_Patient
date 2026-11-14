"""Turn routes (hot path): POST/GET /sessions/{id}/turns, plus read-aloud of a saved
patient turn: POST /sessions/{id}/turns/{turn_idx}/speech (Slice 16, AVP-133)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from fastapi.concurrency import run_in_threadpool

from avp_api.auth import current_user_id
from avp_api.db.repositories.session_repo import SessionRepository, SqlSessionRepository
from avp_api.db.repositories.turn_repo import SqlTurnRepository, TurnRepository
from avp_api.db.session import get_db
from avp_api.providers.llm import LLMProvider, get_llm_provider
from avp_api.providers.tts import (
    FakeTTSProvider,
    TTSProvider,
    get_tts_provider,
    synthesize_timed,
)
from avp_api.providers.voice_common import VoiceProviderError
from avp_api.schemas.turn import TurnCreate, TurnResponse
from avp_api.services import turns_service

router = APIRouter(tags=["turns"])


def get_session_repo(db=Depends(get_db)) -> SessionRepository:
    return SqlSessionRepository(db)


def get_turn_repo(db=Depends(get_db)) -> TurnRepository:
    return SqlTurnRepository(db)


def get_provider() -> LLMProvider:
    return get_llm_provider()


def get_tts() -> TTSProvider:
    return get_tts_provider()


@router.post("/sessions/{session_id}/turns", response_model=TurnResponse)
def create_turn(
    session_id: str,
    payload: TurnCreate,
    session_repo: SessionRepository = Depends(get_session_repo),
    turn_repo: TurnRepository = Depends(get_turn_repo),
    provider: LLMProvider = Depends(get_provider),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> TurnResponse:
    return turns_service.submit_turn(
        session_id, payload.text, session_repo, turn_repo, provider, user_id, x_guest_token
    )


@router.get("/sessions/{session_id}/turns", response_model=list[TurnResponse])
def list_turns(
    session_id: str,
    session_repo: SessionRepository = Depends(get_session_repo),
    turn_repo: TurnRepository = Depends(get_turn_repo),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> list[TurnResponse]:
    return turns_service.list_turns(session_id, session_repo, turn_repo, user_id, x_guest_token)


@router.post(
    "/sessions/{session_id}/turns/{turn_idx}/speech",
    response_class=Response,
    responses={
        200: {
            "description": "The patient turn as audio (format in Content-Type).",
            "content": {"audio/wav": {}, "audio/mpeg": {}},
        },
        204: {"description": "No real TTS provider is configured: nothing to play."},
        404: {"description": "Session or patient turn not found (or not yours)."},
        503: {"description": "TTS_UNAVAILABLE: the TTS provider failed; the text reply stands."},
    },
)
async def speak_turn(
    session_id: str,
    turn_idx: int,
    session_repo: SessionRepository = Depends(get_session_repo),
    turn_repo: TurnRepository = Depends(get_turn_repo),
    tts: TTSProvider = Depends(get_tts),
    user_id: str | None = Depends(current_user_id),
    x_guest_token: str | None = Header(default=None),
) -> Response:
    """Read a saved patient turn aloud, so a typed question gets a spoken reply too.
    Never logs the text or audio (voice_common logs provider, outcome and ms only)."""
    text = await run_in_threadpool(
        turns_service.patient_turn_text,
        session_id,
        turn_idx,
        session_repo,
        turn_repo,
        user_id,
        x_guest_token,
    )
    if isinstance(tts, FakeTTSProvider):
        return Response(status_code=204)  # a beep after every typed turn would only annoy
    try:
        spoken = await synthesize_timed(tts, text)
    except VoiceProviderError as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": "TTS_UNAVAILABLE", "message": "Speech is unavailable right now."},
        ) from exc
    return Response(
        content=spoken.value.audio,
        media_type=spoken.value.mime,
        headers={"Cache-Control": "no-store"},
    )
