"""Vitals state machine (Slice 4, AVP-102).

Deterministic clinical-grade transitions for the pediatric HFMD case, per
docs/specs/vitals-state-machine.md (QĐ 1003/QĐ-BYT). State is persisted in
sessions.state["vitals"] (jsonb); the snapshot values are derived from the grade
via the matrix below. Draft scenario content — needs clinician review.
"""

from __future__ import annotations

from datetime import UTC, datetime

from avp_api.db.repositories.session_repo import SessionRepository
from avp_api.schemas.vitals import ClinicalState, VitalsEvent, VitalsSnapshot
from avp_api.services import guide_service, session_service

INITIAL_STATE: ClinicalState = "GRADE_2A_BASELINE"

# state -> (temp_c, hr, rr, bp_sys, bp_dia, spo2)
_MATRIX: dict[ClinicalState, tuple[float, int, int, int, int, int]] = {
    "GRADE_1": (37.8, 115, 27, 90, 60, 98),
    "GRADE_2A_BASELINE": (39.2, 142, 32, 95, 65, 97),
    "GRADE_2A_HIGH_FEVER": (39.8, 155, 36, 100, 65, 96),
    "GRADE_2B_PROGRESSION": (39.5, 168, 44, 110, 70, 94),
    "STABILIZED": (37.8, 124, 28, 92, 60, 98),
}

_LABELS: dict[ClinicalState, str] = {
    "GRADE_1": "Độ 1 - Nhẹ, ổn định",
    "GRADE_2A_BASELINE": "Độ 2a - Sốt cao khó hạ, quấy khóc",
    "GRADE_2A_HIGH_FEVER": "Độ 2a - Sốt cao kéo dài",
    "GRADE_2B_PROGRESSION": "Độ 2b - Biến chứng thần kinh",
    "STABILIZED": "Đã đáp ứng điều trị - Hạ sốt",
}

_SYMPTOMS: dict[ClinicalState, list[str]] = {
    "GRADE_1": ["Tỉnh táo", "Loét vòm họng nhẹ", "Vài nốt sẩn ở mông/gối"],
    "GRADE_2A_BASELINE": ["Quấy khóc nhiều", "Giật mình 1 lần khi thiu thiu ngủ", "Sốt khó hạ"],
    "GRADE_2A_HIGH_FEVER": ["Sốt liên tục không hạ", "Lừ đừ", "Quấy khóc từng cơn"],
    "GRADE_2B_PROGRESSION": [
        "Giật mình chới với ≥2 lần/30 phút",
        "Run tay",
        "Mắt nhìn sững",
        "Mạch nhanh khi nằm yên",
    ],
    "STABILIZED": ["Hạ sốt", "Ngủ yên", "Nhịp tim giảm dần", "Hết giật mình"],
}


def transition(state: ClinicalState, event: VitalsEvent) -> ClinicalState:
    """Pure deterministic transition (vitals-state-machine.md diagram)."""
    if event == "TIME_TICK":
        if state == "GRADE_2A_BASELINE":
            return "GRADE_2A_HIGH_FEVER"
        if state == "GRADE_2A_HIGH_FEVER":
            return "GRADE_2B_PROGRESSION"
        return state
    if event == "ORDER_ANTIPYRETIC":
        # Paracetamol 10-15 mg/kg: stabilises a 2a fever; not enough alone at 2b.
        if state in ("GRADE_2A_BASELINE", "GRADE_2A_HIGH_FEVER"):
            return "STABILIZED"
        return state
    if event == "ORDER_SEDATIVE":
        # Phenobarbital for the startle reflex: cuts progression at high-fever / 2b.
        if state in ("GRADE_2A_HIGH_FEVER", "GRADE_2B_PROGRESSION"):
            return "STABILIZED"
        return state
    # MEASURE_VITALS and ORDER_INCORRECT do not change the grade.
    return state


def snapshot_for(state: ClinicalState) -> VitalsSnapshot:
    t, hr, rr, sys, dia, spo2 = _MATRIX[state]
    return VitalsSnapshot(
        temperature_c=t,
        heart_rate_bpm=hr,
        respiratory_rate_bpm=rr,
        blood_pressure_sys=sys,
        blood_pressure_dia=dia,
        spo2_percent=spo2,
        clinical_state=state,
        clinical_label=_LABELS[state],
        active_symptoms=_SYMPTOMS[state],
        updated_at=datetime.now(UTC),
    )


def _current_state(state_json: dict) -> ClinicalState:
    value = (state_json or {}).get("vitals", {}).get("clinical_state")
    return value if value in _MATRIX else INITIAL_STATE


def get_vitals(
    session_id: str, repo: SessionRepository, user_id: str | None, guest_token: str | None
) -> VitalsSnapshot:
    session_service.get_session(session_id, repo, user_id, guest_token)  # ownership (404 on miss)
    rec = repo.get(session_id)
    return snapshot_for(_current_state(rec.state if rec else {}))


def apply_event(
    session_id: str,
    event: VitalsEvent,
    repo: SessionRepository,
    user_id: str | None,
    guest_token: str | None,
) -> VitalsSnapshot:
    sess = session_service.get_session(session_id, repo, user_id, guest_token)  # 404 on miss
    # Orders after the exam time limit are refused like turns (AVP-112 follow-up).
    guide_service.ensure_within_time_limit(sess.mode, sess.created_at)
    rec = repo.get(session_id)
    state = rec.state if rec else {}
    new_state = transition(_current_state(state), event)
    merged = {
        **(state or {}),
        "vitals": {"clinical_state": new_state, "updated_at": datetime.now(UTC).isoformat()},
    }
    repo.update_state(session_id, merged)
    return snapshot_for(new_state)
