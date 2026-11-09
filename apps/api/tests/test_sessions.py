"""Session API tests (Slice 2, AVP-008) with an in-memory fake repository."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from avp_api.db.repositories.session_repo import SessionRecord
from avp_api.main import create_app
from avp_api.routers.sessions import get_session_repo


class FakeRepo:
    def __init__(self) -> None:
        self.rows: dict[str, SessionRecord] = {}

    def active_case_version(self, case_id: str) -> int | None:
        return 1 if case_id == "case-01-hfmd" else None

    def create(self, **kwargs) -> SessionRecord:
        rid = str(uuid.uuid4())
        rec = SessionRecord(id=rid, started_at=datetime.now(UTC), **kwargs)
        self.rows[rid] = rec
        return rec

    def get(self, session_id: str) -> SessionRecord | None:
        return self.rows.get(session_id)


# One shared repo instance; cleared before each test (create + get share data).
_REPO = FakeRepo()


@pytest.fixture(autouse=True)
def _fresh_repo():
    _REPO.rows.clear()


@pytest.fixture
def client() -> TestClient:
    app = create_app()
    app.dependency_overrides[get_session_repo] = lambda: _REPO
    with TestClient(app) as c:
        yield c


def test_create_with_consent_returns_201_and_guest_token(client: TestClient) -> None:
    r = client.post(
        "/api/v1/sessions",
        json={"case_id": "case-01-hfmd", "mode": "guided", "role": "student", "consent": True},
    )
    assert r.status_code == 201
    body = r.json()
    uuid.UUID(body["id"])  # valid UUID
    assert body["guest_token"]
    assert r.headers.get("X-Guest-Token") == body["guest_token"]
    assert body["status"] == "active"
    assert body["mode"] == "guided"
    assert body["role"] == "student"


def test_create_without_consent_returns_400(client: TestClient) -> None:
    r = client.post("/api/v1/sessions", json={"case_id": "case-01-hfmd", "consent": False})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "CONSENT_REQUIRED"


def test_get_session_with_guest_token(client: TestClient) -> None:
    created = client.post("/api/v1/sessions", json={"case_id": "case-01-hfmd", "consent": True})
    sid = created.json()["id"]
    token = created.json()["guest_token"]

    ok = client.get(f"/api/v1/sessions/{sid}", headers={"X-Guest-Token": token})
    assert ok.status_code == 200
    assert ok.json()["id"] == sid

    # Missing guest token -> 404 (existence not leaked, T-SEC-01).
    denied = client.get(f"/api/v1/sessions/{sid}")
    assert denied.status_code == 404


def test_create_unknown_case_returns_404(client: TestClient) -> None:
    r = client.post("/api/v1/sessions", json={"case_id": "does-not-exist", "consent": True})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "CASE_NOT_FOUND"
