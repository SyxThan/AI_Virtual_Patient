"""GET /sessions/{id}/guide (Slice 12, AVP-112 / TASK-S12-03).

Synthetic case and users only. Guided mode returns the rubric-derived checklist
(verbatim titles, draft label, no answer key); exam mode returns no items, which
is checked at API level, not only in the UI.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from avp_api import auth
from avp_api.config import get_settings
from avp_api.db.repositories.session_repo import SessionRecord
from avp_api.main import create_app
from avp_api.routers import guide, sessions

USERS = {
    "user-a": "00000000-0000-4000-8000-00000000000a",
    "user-b": "00000000-0000-4000-8000-00000000000b",
}
A = {"Authorization": "Bearer user-a"}
B = {"Authorization": "Bearer user-b"}

# Synthetic rubric: shape of schemas/case.schema.json, content is placeholder text.
CASE = {
    "rubric": {
        "version": 7,
        "scale": [0, 1, 2],
        "items": [
            {
                "id": "r-one",
                "domain": "history",
                "criterion": "Synthetic criterion one",
                "weight": 3,
                "critical": True,
                "anchors": {"0": "SECRET-ANCHOR-0", "1": "SECRET-ANCHOR-1", "2": "SECRET-ANCHOR-2"},
                "origin": "author_added",
                "expected_questions": ["SECRET-EXPECTED-Q"],
            },
            {
                "id": "r-two",
                "domain": "communication",
                "criterion": "Synthetic criterion two",
                "weight": 1,
                "critical": False,
                "anchors": {"0": "a", "1": "b", "2": "c"},
                "origin": "author_added",
                "expected_questions": ["another"],
            },
        ],
    }
}


class FakeVerifier:
    def verify(self, token: str) -> str:
        if token not in USERS:
            raise HTTPException(status_code=401, detail={"code": "INVALID_TOKEN", "message": "x"})
        return USERS[token]


class FakeSessionRepo:
    def __init__(self, store: dict[str, SessionRecord]) -> None:
        self.store = store

    def active_case_version(self, case_id: str) -> int | None:
        return 1 if case_id == "case-01-hfmd" else None

    def get_case_content(self, case_id: str, version: int) -> dict:
        return CASE

    def create(self, **kw) -> SessionRecord:
        rec = SessionRecord(id=str(uuid.uuid4()), started_at=datetime.now(UTC), **kw)
        self.store[rec.id] = rec
        return rec

    def get(self, session_id: str) -> SessionRecord | None:
        return self.store.get(session_id)

    def update_state(self, session_id: str, state: dict) -> None:
        self.store[session_id].state = state

    def set_status(self, session_id: str, status: str) -> None:
        self.store[session_id].status = status


@pytest.fixture
def harness():
    store: dict[str, SessionRecord] = {}
    app = create_app()
    ov = app.dependency_overrides
    ov[auth.get_verifier] = lambda: FakeVerifier()
    ov[sessions.get_session_repo] = lambda: FakeSessionRepo(store)
    ov[guide.get_session_repo] = lambda: FakeSessionRepo(store)
    return TestClient(app), store


def _new(client: TestClient, mode: str, headers: dict | None = None) -> tuple[str, dict]:
    r = client.post("/api/v1/sessions", json={"consent": True, "mode": mode}, headers=headers or {})
    assert r.status_code == 201, r.text
    body = r.json()
    auth_headers = dict(headers or {})
    if body.get("guest_token"):
        auth_headers["X-Guest-Token"] = body["guest_token"]
    return body["id"], auth_headers


def test_guided_mode_returns_rubric_checklist_verbatim(harness) -> None:
    client, _ = harness
    sid, h = _new(client, "guided")
    r = client.get(f"/api/v1/sessions/{sid}/guide", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "guided"
    assert body["checklist_enabled"] is True
    assert body["rubric_version"] == 7
    assert [(i["criterion_id"], i["domain"], i["title"]) for i in body["items"]] == [
        ("r-one", "history", "Synthetic criterion one"),
        ("r-two", "communication", "Synthetic criterion two"),
    ]
    # Guided sessions are never time-limited.
    assert body["time_limit_s"] is None
    assert body["deadline_at"] is None
    assert body["time_limit_reached"] is False


def test_checklist_does_not_leak_answer_key(harness) -> None:
    client, _ = harness
    sid, h = _new(client, "guided")
    raw = client.get(f"/api/v1/sessions/{sid}/guide", headers=h).text
    for secret in ("SECRET-ANCHOR", "SECRET-EXPECTED-Q", "weight", "critical", "anchors"):
        assert secret not in raw
    item_keys = {k for i in client.get(f"/api/v1/sessions/{sid}/guide", headers=h).json()["items"]
                 for k in i}  # fmt: skip
    assert item_keys == {"criterion_id", "domain", "title"}


def test_guide_is_labelled_draft(harness) -> None:
    client, _ = harness
    for mode in ("guided", "exam"):
        sid, h = _new(client, mode)
        body = client.get(f"/api/v1/sessions/{sid}/guide", headers=h).json()
        assert body["review_status"] == "draft"
        assert body["notice"]
    sid, h = _new(client, "guided")
    assert (
        "clinician review"
        in client.get(f"/api/v1/sessions/{sid}/guide", headers=h).json()["notice"]
    )


def test_exam_mode_returns_no_checklist_items(harness) -> None:
    client, _ = harness
    sid, h = _new(client, "exam")
    r = client.get(f"/api/v1/sessions/{sid}/guide", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "exam"
    assert body["checklist_enabled"] is False
    assert body["items"] == []
    assert body["rubric_version"] is None
    assert "Synthetic criterion" not in r.text


def test_exam_mode_reports_time_limit_and_start(harness, monkeypatch) -> None:
    client, store = harness
    monkeypatch.setattr(get_settings(), "exam_time_limit_s", 900)
    sid, h = _new(client, "exam")
    body = client.get(f"/api/v1/sessions/{sid}/guide", headers=h).json()
    started = store[sid].started_at
    assert body["time_limit_s"] == 900
    assert datetime.fromisoformat(body["started_at"]) == started
    assert datetime.fromisoformat(body["deadline_at"]) == started + timedelta(seconds=900)
    assert body["time_limit_reached"] is False
    assert datetime.fromisoformat(body["server_now"]) >= started

    store[sid].started_at = datetime.now(UTC) - timedelta(seconds=901)
    assert client.get(f"/api/v1/sessions/{sid}/guide", headers=h).json()["time_limit_reached"]


def test_exam_default_has_no_time_limit(harness) -> None:
    client, _ = harness
    assert get_settings().exam_time_limit_s is None
    sid, h = _new(client, "exam")
    body = client.get(f"/api/v1/sessions/{sid}/guide", headers=h).json()
    assert body["time_limit_s"] is None
    assert body["deadline_at"] is None


def test_guest_session_needs_its_own_token(harness) -> None:
    client, _ = harness
    sid, h = _new(client, "guided")
    assert client.get(f"/api/v1/sessions/{sid}/guide").status_code == 404
    r = client.get(f"/api/v1/sessions/{sid}/guide", headers={"X-Guest-Token": "f" * 64})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "SESSION_NOT_FOUND"
    # Another guest's valid token does not open this session either.
    _, other = _new(client, "guided")
    assert client.get(f"/api/v1/sessions/{sid}/guide", headers=other).status_code == 404
    assert client.get(f"/api/v1/sessions/{sid}/guide", headers=h).status_code == 200


def test_user_session_is_hidden_from_other_user_and_guests(harness) -> None:
    client, _ = harness
    sid, h = _new(client, "guided", A)
    assert client.get(f"/api/v1/sessions/{sid}/guide", headers=h).status_code == 200
    r = client.get(f"/api/v1/sessions/{sid}/guide", headers=B)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "SESSION_NOT_FOUND"
    assert client.get(f"/api/v1/sessions/{sid}/guide").status_code == 404


def test_invalid_bearer_token_is_rejected(harness) -> None:
    client, _ = harness
    sid, _ = _new(client, "guided", A)
    r = client.get(f"/api/v1/sessions/{sid}/guide", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_unknown_session_is_404(harness) -> None:
    client, _ = harness
    r = client.get(f"/api/v1/sessions/{uuid.uuid4()}/guide", headers=A)
    assert r.status_code == 404
