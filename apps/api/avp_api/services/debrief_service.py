"""GET /sessions/{id}/debrief logic (Slice 8, AVP-019). Ownership reuses
session_service.get_session (404 on any miss, T-SEC-01)."""

from __future__ import annotations

from fastapi import HTTPException

from avp_api.db.repositories.debrief_repo import DebriefRepository
from avp_api.db.repositories.evaluation_repo import EvaluationRepository
from avp_api.db.repositories.job_repo import JobRepository
from avp_api.db.repositories.session_repo import SessionRepository
from avp_api.schemas.debrief import DebriefClaimItem, DebriefResponse, PedagogicalSummary
from avp_api.services import session_service

EVALUATE, DEBRIEF = "evaluate", "debrief"

# Stored error code -> student-facing message (never a stack trace).
_ERROR_TEXT = {
    "PROVIDER_ERROR": "Dịch vụ tạo phản hồi tạm thời không phản hồi.",
    "INVALID_OUTPUT": "Không tạo được phản hồi hợp lệ cho buổi khám này.",
    "CONSENT_MISSING": "Phiên này chưa có đồng ý sử dụng dữ liệu nên không tạo phản hồi.",
    "EVALUATION_FAILED": "Chưa có kết quả chấm nên chưa tạo được phản hồi. Hãy thử chấm lại.",
}
_DEFAULT_ERROR = "Không tạo được phản hồi cho buổi khám này."


def get_debrief(
    session_id: str,
    session_repo: SessionRepository,
    eval_repo: EvaluationRepository,
    debrief_repo: DebriefRepository,
    job_repo: JobRepository,
    user_id: str | None,
    guest_token: str | None,
) -> DebriefResponse:
    sess = session_service.get_session(session_id, session_repo, user_id, guest_token)
    if sess.status == "active":
        raise HTTPException(
            status_code=409,
            detail={"code": "SESSION_NOT_FINISHED", "message": "Finish the session first."},
        )
    pending = DebriefResponse(status="pending", session_id=session_id)
    if job_repo.has_open_job(session_id, EVALUATE) or job_repo.has_open_job(session_id, DEBRIEF):
        return pending
    evaluation = eval_repo.latest_for_session(session_id)
    if evaluation is None:
        return pending
    if evaluation.status == "failed":
        return DebriefResponse(
            status="failed",
            session_id=session_id,
            evaluation_id=evaluation.id,
            error=_ERROR_TEXT["EVALUATION_FAILED"],
        )
    rec = debrief_repo.latest_for_session(session_id)
    if rec is None or rec.evaluation_id != evaluation.id:
        return pending  # the debrief for the current evaluation is not written yet
    c = rec.content
    base = {
        "session_id": session_id,
        "id": rec.id,
        "evaluation_id": rec.evaluation_id,
        "model": c.get("model"),
        "prompt_version": c.get("prompt_version"),
        "created_at": rec.created_at,
    }
    if c.get("status") != "done":
        error = _ERROR_TEXT.get(c.get("error") or "", _DEFAULT_ERROR)
        return DebriefResponse(status="failed", error=error, **base)
    return DebriefResponse(
        status="done",
        summary=PedagogicalSummary.model_validate(c["summary"]),
        items=[DebriefClaimItem.model_validate(i) for i in c.get("items", [])],
        critical_missed=c.get("critical_missed"),
        embedding_model=c.get("embedding_model"),
        sources_reviewed=bool(c.get("sources_reviewed")),
        **base,
    )
