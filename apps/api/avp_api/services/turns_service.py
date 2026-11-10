"""Turn loop (hot path, AVP-012): persist the student turn, get the patient reply
via the Patient Agent, persist it, return it. Ownership reuses session_service."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException

from avp_api.db.repositories.session_repo import SessionRepository
from avp_api.db.repositories.turn_repo import TurnRecord, TurnRepository
from avp_api.providers.llm import LLMProvider
from avp_api.schemas.turn import TurnResponse
from avp_api.services import patient_agent, session_service

_MAX_TEXT = 2000


def _elapsed_ms(started_at: datetime) -> int:
    return max(0, int((datetime.now(UTC) - started_at).total_seconds() * 1000))


def _to_response(rec: TurnRecord) -> TurnResponse:
    return TurnResponse(
        turn_idx=rec.idx, speaker=rec.speaker, text=rec.text, created_at=rec.created_at
    )


def submit_turn(
    session_id: str,
    text: str,
    session_repo: SessionRepository,
    turn_repo: TurnRepository,
    provider: LLMProvider,
    user_id: str | None,
    guest_token: str | None,
) -> TurnResponse:
    text = (text or "").strip()
    if not text:
        raise HTTPException(
            status_code=400, detail={"code": "EMPTY_TURN", "message": "Turn text is required."}
        )
    if len(text) > _MAX_TEXT:
        raise HTTPException(
            status_code=413, detail={"code": "TURN_TOO_LONG", "message": "Turn text is too long."}
        )

    # Ownership + existence (raises 404 on any miss, T-SEC-01).
    sess = session_service.get_session(session_id, session_repo, user_id, guest_token)
    case = session_repo.get_case_content(sess.case_id, sess.case_version)
    if case is None:
        raise HTTPException(
            status_code=404, detail={"code": "CASE_NOT_FOUND", "message": "Case content missing."}
        )

    transcript = [
        {"speaker": t.speaker, "text": t.text} for t in turn_repo.list_for_session(session_id)
    ]

    # Generate first; if the provider fails, persist nothing so the student can retry
    # without an orphaned turn, and never leak the raw error (ADR-0011).
    try:
        reply, guardrail = patient_agent.respond(case, transcript, text, provider)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "code": "PATIENT_UNAVAILABLE",
                "message": "Người bệnh tạm thời không phản hồi được, vui lòng thử lại.",
            },
        ) from exc

    t_start = _elapsed_ms(sess.created_at)
    idx = turn_repo.next_idx(session_id)
    turn_repo.add(
        session_id=session_id,
        idx=idx,
        speaker="student",
        text=text,
        t_start_ms=t_start,
        guardrail=None,
    )
    patient_turn = turn_repo.add(
        session_id=session_id,
        idx=idx + 1,
        speaker="patient",
        text=reply,
        t_start_ms=_elapsed_ms(sess.created_at),
        guardrail=guardrail,
    )
    return _to_response(patient_turn)


def list_turns(
    session_id: str,
    session_repo: SessionRepository,
    turn_repo: TurnRepository,
    user_id: str | None,
    guest_token: str | None,
) -> list[TurnResponse]:
    session_service.get_session(session_id, session_repo, user_id, guest_token)  # ownership
    return [_to_response(t) for t in turn_repo.list_for_session(session_id)]
