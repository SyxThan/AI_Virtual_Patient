"""Exam-mode time limit on the turn loop (Slice 12, AVP-112 / TASK-S12-03).

EXAM_TIME_LIMIT_S is undecided (OPEN_QUESTIONS Q9): the default is no limit.
When set, an exam session past its limit gets 409 TIME_LIMIT_REACHED and no
turn is persisted; guided sessions are never limited. Synthetic data only.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from avp_api.config import Settings, get_settings
from avp_api.db.repositories.session_repo import SessionRecord
from avp_api.db.repositories.turn_repo import TurnRecord
from avp_api.main import create_app
from avp_api.providers.llm import FakeLLMProvider
from avp_api.routers import turns

TOKEN = "guest-token"
H = {"X-Guest-Token": TOKEN}
CASE = {
    "patient": {"persona": {"personality": "lo lắng", "emotional_state": "hoang mang"}},
    "history": [{"topic": "Sốt", "polarity": "positive", "lay_response": "Dạ cháu sốt ạ."}],
    "forbidden_terms": [],
    "fallback_lines": {
        "unknown_symptom": ["Dạ em không rõ ạ."],
        "not_ordered_lab": ["Dạ chưa làm ạ."],
        "out_of_scope": ["Dạ bác sĩ giúp em ạ."],
    },
}


class FakeSessionRepo:
    def __init__(self, rec: SessionRecord) -> None:
        self.rec = rec

    def get(self, session_id: str) -> SessionRecord | None:
        return self.rec if session_id == self.rec.id else None

    def get_case_content(self, case_id: str, version: int) -> dict:
        return CASE

    def active_case_version(self, case_id: str) -> int:
        return 1


class FakeTurnRepo:
    def __init__(self) -> None:
        self.rows: list[TurnRecord] = []

    def next_idx(self, session_id: str) -> int:
        return len(self.rows)

    def add(self, **kw) -> TurnRecord:
        rec = TurnRecord(
            id=len(self.rows) + 1,
            session_id=kw["session_id"],
            idx=kw["idx"],
            speaker=kw["speaker"],
            text=kw["text"],
            t_start_ms=kw["t_start_ms"],
            created_at=datetime.now(UTC),
        )
        self.rows.append(rec)
        return rec

    def list_for_session(self, session_id: str) -> list[TurnRecord]:
        return [r for r in self.rows if r.session_id == session_id]


def _session(mode: str, age_s: int) -> SessionRecord:
    return SessionRecord(
        id=str(uuid.uuid4()),
        case_id="case-01-hfmd",
        case_version=1,
        mode=mode,
        status="active",
        user_id=None,
        guest_token_hash=hashlib.sha256(TOKEN.encode()).hexdigest(),
        consented_at=datetime.now(UTC),
        state={"role": "student"},
        started_at=datetime.now(UTC) - timedelta(seconds=age_s),
    )


def _client(rec: SessionRecord, turn_repo: FakeTurnRepo) -> TestClient:
    app = create_app()
    app.dependency_overrides[turns.get_session_repo] = lambda: FakeSessionRepo(rec)
    app.dependency_overrides[turns.get_turn_repo] = lambda: turn_repo
    app.dependency_overrides[turns.get_provider] = lambda: FakeLLMProvider()
    return TestClient(app)


def _ask(client: TestClient, rec: SessionRecord):
    return client.post(
        f"/api/v1/sessions/{rec.id}/turns", json={"text": "Cháu sốt mấy ngày rồi chị?"}, headers=H
    )


@pytest.fixture
def limit(monkeypatch):
    def _set(seconds: int | None) -> None:
        monkeypatch.setattr(get_settings(), "exam_time_limit_s", seconds)

    return _set


def test_exam_turn_after_limit_is_409_and_not_persisted(limit) -> None:
    limit(600)
    rec, repo = _session("exam", age_s=601), FakeTurnRepo()
    r = _ask(_client(rec, repo), rec)
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "TIME_LIMIT_REACHED"
    assert repo.rows == []


def test_exam_turn_within_limit_is_answered(limit) -> None:
    limit(600)
    rec, repo = _session("exam", age_s=30), FakeTurnRepo()
    r = _ask(_client(rec, repo), rec)
    assert r.status_code == 200, r.text
    assert [t.speaker for t in repo.rows] == ["student", "patient"]


def test_no_limit_by_default(limit) -> None:
    assert Settings(_env_file=None).exam_time_limit_s is None
    limit(None)
    rec, repo = _session("exam", age_s=10 * 3600), FakeTurnRepo()
    assert _ask(_client(rec, repo), rec).status_code == 200


def test_guided_mode_is_never_limited(limit) -> None:
    limit(60)
    rec, repo = _session("guided", age_s=10 * 3600), FakeTurnRepo()
    assert _ask(_client(rec, repo), rec).status_code == 200


def test_ownership_is_checked_before_the_limit(limit) -> None:
    # A stranger must get the same 404 as for any other miss, not a 409 that leaks existence.
    limit(60)
    rec, repo = _session("exam", age_s=3600), FakeTurnRepo()
    r = _client(rec, repo).post(
        f"/api/v1/sessions/{rec.id}/turns", json={"text": "x"}, headers={"X-Guest-Token": "bad"}
    )
    assert r.status_code == 404


def test_blank_env_value_means_no_limit(monkeypatch) -> None:
    monkeypatch.setenv("EXAM_TIME_LIMIT_S", "")
    assert Settings(_env_file=None).exam_time_limit_s is None
    monkeypatch.setenv("EXAM_TIME_LIMIT_S", "900")
    assert Settings(_env_file=None).exam_time_limit_s == 900
