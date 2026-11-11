"""Finish / evaluation route logic (Slice 7, AVP-014). Ownership reuses
session_service.get_session (404 on any miss, T-SEC-01)."""

from __future__ import annotations

from fastapi import HTTPException

from avp_api.db.repositories.evaluation_repo import EvaluationRecord, EvaluationRepository
from avp_api.db.repositories.job_repo import JobRepository
from avp_api.db.repositories.session_repo import SessionRepository
from avp_api.schemas.evaluation import CriterionResultResponse, EvaluationResponse
from avp_api.schemas.session import SessionResponse
from avp_api.services import session_service
from avp_api.services.scoring_engine import item_score

EVALUATE = "evaluate"

# Stored error code -> student-facing message (never a stack trace).
_ERROR_TEXT = {
    "PROVIDER_ERROR": "Dịch vụ chấm điểm tạm thời không phản hồi. Bạn hãy thử lại.",
    "INVALID_OUTPUT": "Không tạo được kết quả chấm hợp lệ. Bạn hãy thử lại.",
    "CONSENT_MISSING": "Phiên này chưa có đồng ý sử dụng dữ liệu nên không được chấm.",
}
_DEFAULT_ERROR = "Không chấm được buổi khám này. Bạn hãy thử lại."


def finish_session(
    session_id: str,
    session_repo: SessionRepository,
    job_repo: JobRepository,
    user_id: str | None,
    guest_token: str | None,
) -> tuple[SessionResponse, int | None]:
    """Idempotent: only an `active` session moves to `completed` and gets a job.
    Returns the session and the new job id (None when nothing was enqueued)."""
    sess = session_service.get_session(session_id, session_repo, user_id, guest_token)
    rec = session_repo.get(session_id)
    if rec is not None and rec.consented_at is None:
        raise HTTPException(
            status_code=403,
            detail={"code": "CONSENT_REQUIRED", "message": "Consent is required to evaluate."},
        )
    job_id = None
    if sess.status == "active":
        job_id = job_repo.transition_and_enqueue(session_id, ("active",), "completed", EVALUATE)
    return session_service.get_session(session_id, session_repo, user_id, guest_token), job_id


def retry_evaluation(
    session_id: str,
    session_repo: SessionRepository,
    job_repo: JobRepository,
    user_id: str | None,
    guest_token: str | None,
) -> tuple[SessionResponse, int]:
    session_service.get_session(session_id, session_repo, user_id, guest_token)
    job_id = job_repo.transition_and_enqueue(session_id, ("failed",), "completed", EVALUATE)
    if job_id is None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "RETRY_NOT_ALLOWED",
                "message": "Only a failed evaluation can be retried.",
            },
        )
    return session_service.get_session(session_id, session_repo, user_id, guest_token), job_id


def _criteria(rec: EvaluationRecord, rubric_items: list[dict]) -> list[CriterionResultResponse]:
    meta = {c["id"]: c for c in rubric_items}
    out = []
    for v in rec.items:
        c = meta.get(v.criterion_id, {})
        out.append(
            CriterionResultResponse(
                criterion_id=v.criterion_id,
                criterion=c.get("criterion", v.criterion_id),
                domain=c.get("domain"),
                weight=float(c.get("weight", 1)),
                critical=bool(c.get("critical", False)),
                level=v.level,
                status=v.status,
                score=item_score(v.level),
                evidence=v.evidence,
                feedback=v.feedback or None,
                flagged=v.flagged,
                low_reliability=c.get("reliability") == "low",
            )
        )
    return out


def get_evaluation(
    session_id: str,
    session_repo: SessionRepository,
    eval_repo: EvaluationRepository,
    job_repo: JobRepository,
    user_id: str | None,
    guest_token: str | None,
) -> EvaluationResponse:
    sess = session_service.get_session(session_id, session_repo, user_id, guest_token)
    if sess.status == "active":
        raise HTTPException(
            status_code=409,
            detail={"code": "SESSION_NOT_FINISHED", "message": "Finish the session first."},
        )
    pending = EvaluationResponse(status="pending", session_id=session_id)
    if job_repo.has_open_job(session_id, EVALUATE):
        return pending
    rec = eval_repo.latest_for_session(session_id)
    if rec is None or rec.status == "pending":
        return pending
    base = {
        "session_id": session_id,
        "evaluation_id": rec.id,
        "rubric_version": rec.rubric_version,
        "scoring_version": rec.scoring_version,
        "model": rec.model,
        "prompt_version": rec.prompt_version,
        "created_at": rec.created_at,
    }
    if rec.status == "failed":
        # No partial score is ever shown as final (evaluation.md, Failure behaviour).
        return EvaluationResponse(
            status="failed", error=_ERROR_TEXT.get(rec.error or "", _DEFAULT_ERROR), **base
        )
    case = session_repo.get_case_content(sess.case_id, sess.case_version) or {}
    rubric_items = (case.get("rubric") or {}).get("items") or []
    return EvaluationResponse(
        status="done",
        total_score=rec.total_score,
        critical_missed=rec.critical_missed,
        criteria=_criteria(rec, rubric_items),
        **base,
    )
