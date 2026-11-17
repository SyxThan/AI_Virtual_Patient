"""Vitals state-machine API tests (Slice 4, AVP-102) with an in-memory fake."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from avp_api.db.repositories.session_repo import SessionRecord
from avp_api.main import create_app
from avp_api.routers import vitals

GOOD = "good-token"
SID = str(uuid.uuid4())


class FakeSessionRepo:
    def __init__(self) -> None:
        self.state: dict = {"role": "student"}
        self.case_id = "case-01-hfmd"

    def get(self, session_id: str) -> SessionRecord | None:
        if session_id != SID:
            return None
        return SessionRecord(
            id=SID,
            case_id=self.case_id,
            case_version=1,
            mode="guided",
            status="active",
            user_id=None,
            guest_token_hash=hashlib.sha256(GOOD.encode()).hexdigest(),
            consented_at=None,
            state=dict(self.state),
            started_at=datetime.now(UTC),
        )

    def update_state(self, session_id: str, state: dict) -> None:
        self.state = state


def _client() -> TestClient:
    app = create_app()
    app.dependency_overrides[vitals.get_session_repo] = lambda: _REPO
    return TestClient(app)


_REPO = FakeSessionRepo()


def _reset() -> None:
    _REPO.state = {"role": "student"}
    _REPO.case_id = "case-01-hfmd"


def test_default_is_baseline() -> None:
    _reset()
    r = _client().get(f"/api/v1/sessions/{SID}/vitals", headers={"X-Guest-Token": GOOD})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["clinical_state"] == "GRADE_2A_BASELINE"
    assert body["temperature_c"] == 39.2
    assert body["heart_rate_bpm"] == 142


def test_antipyretic_stabilizes() -> None:
    _reset()
    client = _client()
    r = client.post(
        f"/api/v1/sessions/{SID}/vitals/events",
        json={"event": "ORDER_ANTIPYRETIC"},
        headers={"X-Guest-Token": GOOD},
    )
    assert r.status_code == 200
    assert r.json()["clinical_state"] == "STABILIZED"
    assert r.json()["temperature_c"] == 37.8
    assert r.json()["heart_rate_bpm"] == 124
    # Persisted: a follow-up GET keeps the new state.
    g = client.get(f"/api/v1/sessions/{SID}/vitals", headers={"X-Guest-Token": GOOD})
    assert g.json()["clinical_state"] == "STABILIZED"


def test_time_tick_worsens_to_high_fever() -> None:
    _reset()
    r = _client().post(
        f"/api/v1/sessions/{SID}/vitals/events",
        json={"event": "TIME_TICK"},
        headers={"X-Guest-Token": GOOD},
    )
    assert r.status_code == 200
    assert r.json()["clinical_state"] == "GRADE_2A_HIGH_FEVER"
    assert r.json()["temperature_c"] == 39.8


def test_wrong_guest_token_denied() -> None:
    _reset()
    r = _client().get(f"/api/v1/sessions/{SID}/vitals", headers={"X-Guest-Token": "wrong"})
    assert r.status_code == 404


def test_case_without_vitals_model_gets_not_applicable_not_hfmd_numbers() -> None:
    """AVP-150 / Hard Rule 1: another case never borrows the HFMD vitals."""
    _reset()
    _REPO.case_id = "case-90-test-2d"
    client = _client()
    h = {"X-Guest-Token": GOOD}
    r = client.get(f"/api/v1/sessions/{SID}/vitals", headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "VITALS_NOT_APPLICABLE"
    r = client.post(
        f"/api/v1/sessions/{SID}/vitals/events", json={"event": "ORDER_ANTIPYRETIC"}, headers=h
    )
    assert r.status_code == 409
    assert "vitals" not in _REPO.state  # nothing written
    _reset()
