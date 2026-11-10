"""Turn loop API tests (AVP-012) with in-memory fakes."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from avp_api.db.repositories.session_repo import SessionRecord
from avp_api.db.repositories.turn_repo import TurnRecord
from avp_api.main import create_app
from avp_api.providers.llm import FakeLLMProvider, LLMProvider
from avp_api.routers import turns

GOOD = "good-token"
SID = str(uuid.uuid4())
CASE = {
    "patient": {"persona": {"personality": "lo lắng", "emotional_state": "hoang mang"}},
    "history": [{"topic": "Sốt", "polarity": "positive", "lay_response": "Dạ cháu sốt ạ."}],
    "forbidden_terms": ["EV71", "độ 2b"],
    "fallback_lines": {
        "unknown_symptom": ["Dạ em không rõ ạ."],
        "not_ordered_lab": ["Dạ chưa làm ạ."],
        "out_of_scope": ["Dạ bác sĩ giúp em ạ."],
    },
}


class FakeSessionRepo:
    def get(self, session_id: str) -> SessionRecord | None:
        if session_id != SID:
            return None
        return SessionRecord(
            id=SID,
            case_id="case-01-hfmd",
            case_version=1,
            mode="guided",
            status="active",
            user_id=None,
            guest_token_hash=hashlib.sha256(GOOD.encode()).hexdigest(),
            consented_at=None,
            state={"role": "student"},
            started_at=datetime.now(UTC),
        )

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


class _FixedProvider(LLMProvider):
    def __init__(self, text: str) -> None:
        self._text = text

    def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
        return self._text


def _client(provider: LLMProvider | None = None) -> TestClient:
    chosen = provider or FakeLLMProvider()  # never hit the network in tests
    app = create_app()
    app.dependency_overrides[turns.get_session_repo] = lambda: FakeSessionRepo()
    app.dependency_overrides[turns.get_turn_repo] = lambda: FakeTurnRepo()
    app.dependency_overrides[turns.get_provider] = lambda: chosen
    return TestClient(app)


def test_turn_loop_persists_two_turns() -> None:
    # One repo instance so POST then GET share state.
    repo = FakeTurnRepo()
    app = create_app()
    app.dependency_overrides[turns.get_session_repo] = lambda: FakeSessionRepo()
    app.dependency_overrides[turns.get_turn_repo] = lambda: repo
    app.dependency_overrides[turns.get_provider] = lambda: FakeLLMProvider()
    client = TestClient(app)

    r = client.post(
        f"/api/v1/sessions/{SID}/turns",
        json={"text": "Cháu sốt mấy ngày rồi chị?"},
        headers={"X-Guest-Token": GOOD},
    )
    assert r.status_code == 200, r.text
    assert r.json()["speaker"] == "patient"
    assert r.json()["turn_idx"] == 1

    got = client.get(f"/api/v1/sessions/{SID}/turns", headers={"X-Guest-Token": GOOD})
    assert got.status_code == 200
    turns_list = got.json()
    assert [t["speaker"] for t in turns_list] == ["student", "patient"]
    assert [t["turn_idx"] for t in turns_list] == [0, 1]


def test_wrong_guest_token_denied() -> None:
    client = _client()
    r = client.post(
        f"/api/v1/sessions/{SID}/turns",
        json={"text": "Xin chào"},
        headers={"X-Guest-Token": "wrong"},
    )
    assert r.status_code == 404


def test_guardrail_hides_forbidden_term() -> None:
    client = _client(provider=_FixedProvider("Cháu bị EV71 độ 2b rồi ạ."))
    r = client.post(
        f"/api/v1/sessions/{SID}/turns",
        json={"text": "Con tôi bị sao?"},
        headers={"X-Guest-Token": GOOD},
    )
    assert r.status_code == 200
    text = r.json()["text"]
    assert "EV71" not in text and "2b" not in text
