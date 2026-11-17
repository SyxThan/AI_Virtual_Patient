"""Physical exam actions (Slice 5-02, AVP-104).

Exam findings are tier-1 clinical facts: they come VERBATIM from the case JSON
`exam[].finding`, never from the UI or an LLM (Hard Rule 1). A region the case
does not document is UNKNOWN: we record and return `documented=False` with no
finding text — never an invented "normal" / negative.

Each action writes two transcript turns (student action + system finding) so the
exam shows in session history and is available to the Evaluator later.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException

from avp_api.db.repositories.session_repo import SessionRepository
from avp_api.db.repositories.turn_repo import TurnRepository
from avp_api.schemas.action import ExamActionRequest, ExamActionResponse
from avp_api.services import guide_service, session_service

# Hotspot -> exam[].region now comes from each case's catalog.exam_regions
# (`exam_region`, default: the hotspot id), AVP-150. This table only serves HFMD
# case versions loaded before that field existed (sessions pin their version).
# ASSUMPTION pending clinician confirmation: one "skin" entry covers hands, feet,
# buttocks and knees, and one "mouth" entry; the avatar has 4 tap targets.
LEGACY_CASE_IDS = frozenset({"case-01-hfmd"})
LEGACY_UI_TO_CASE_REGION: dict[str, str] = {
    "mouth_throat": "mouth",
    "palm_hands": "skin",
    "feet": "skin",
    "buttocks_knees": "skin",
}
# "Observe the child lying still" is an observation, not a body tap.
OBSERVE_CASE_REGION = "general"

# Transcript labels for the student's action (transcript data, Vietnamese); a
# catalog label wins over these.
_ACTION_LABELS: dict[str, str] = {
    "mouth_throat": "miệng - họng",
    "palm_hands": "lòng bàn tay",
    "feet": "lòng bàn chân",
    "buttocks_knees": "mông - đầu gối",
    "observe_child": "quan sát trẻ nằm yên",
}
_UNKNOWN_TRANSCRIPT = "Không có ghi nhận trong hồ sơ cho vùng này."


def case_regions(case: dict) -> dict[str, tuple[str, str]]:
    """hotspot id -> (exam[].region, transcript label) for this case version.
    Catalog first; a case version without a catalog falls back to the legacy
    HFMD table so sessions pinned to it keep working."""
    legacy = case.get("id") in LEGACY_CASE_IDS
    catalog = case.get("catalog")
    raw = catalog.get("exam_regions") if isinstance(catalog, dict) else None
    if not isinstance(raw, list) or not raw:
        if not legacy:
            return {}  # a non-HFMD case without hotspots offers no exam regions
        return {k: (v, _ACTION_LABELS[k]) for k, v in LEGACY_UI_TO_CASE_REGION.items()}
    out: dict[str, tuple[str, str]] = {}
    for r in raw:
        if not isinstance(r, dict) or not r.get("id"):
            continue
        rid = r["id"]
        fallback = LEGACY_UI_TO_CASE_REGION.get(rid) if legacy else None
        region = r.get("exam_region") or fallback or rid
        label = (r.get("label") or _ACTION_LABELS.get(rid) or rid).lower()
        out[rid] = (region, label)
    return out


def _elapsed_ms(started_at: datetime) -> int:
    return max(0, int((datetime.now(UTC) - started_at).total_seconds() * 1000))


def perform_action(
    session_id: str,
    req: ExamActionRequest,
    session_repo: SessionRepository,
    turn_repo: TurnRepository,
    user_id: str | None,
    guest_token: str | None,
) -> ExamActionResponse:
    sess = session_service.get_session(session_id, session_repo, user_id, guest_token)
    if sess.status != "active":
        raise HTTPException(
            status_code=409,
            detail={"code": "SESSION_FINISHED", "message": "This session has ended."},
        )
    # Exam time limit applies to examination actions too (AVP-112 follow-up).
    guide_service.ensure_within_time_limit(sess.mode, sess.created_at)
    case = session_repo.get_case_content(sess.case_id, sess.case_version)
    if case is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "CASE_NOT_FOUND", "message": "Case content missing."},
        )

    if req.action == "observe_child":
        case_region: str | None = OBSERVE_CASE_REGION
        label = _ACTION_LABELS["observe_child"]
    else:
        regions = case_regions(case)
        if req.region not in regions:
            raise HTTPException(
                status_code=422,
                detail={"code": "UNKNOWN_REGION", "message": "This case has no such exam region."},
            )
        case_region, label = regions[req.region]

    entries = [e for e in case.get("exam", []) if case_region and e.get("region") == case_region]
    documented = bool(entries)
    finding = "\n".join(e["finding"] for e in entries) if documented else None
    case_action = entries[0].get("action") if documented else None
    red_flag = any(e.get("red_flag") for e in entries)

    student_text = f"[Khám - {label}] {case_action}" if case_action else f"[Khám - {label}]"
    system_text = finding if documented else _UNKNOWN_TRANSCRIPT

    t_start = _elapsed_ms(sess.created_at)
    idx = turn_repo.next_idx(session_id)
    exam_meta = {
        "kind": "exam",
        "action": req.action,
        "ui_region": req.region,
        "case_region": case_region,
        "documented": documented,
        "exam_ids": [e.get("id") for e in entries],
    }
    turn_repo.add(
        session_id=session_id,
        idx=idx,
        speaker="student",
        text=student_text,
        t_start_ms=t_start,
        guardrail=exam_meta,
    )
    system_turn = turn_repo.add(
        session_id=session_id,
        idx=idx + 1,
        speaker="system",
        text=system_text,
        t_start_ms=t_start,
        guardrail=exam_meta,
    )

    return ExamActionResponse(
        action=req.action,
        region=req.region,
        case_region=case_region,
        documented=documented,
        finding=finding,
        case_action=case_action,
        red_flag=red_flag,
        review_status=case.get("review", {}).get("status", "draft"),
        turn_idx=system_turn.idx,
    )
