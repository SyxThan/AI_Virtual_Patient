"""Exam action tests (Slice 5-02, AVP-104) against the real case-01 exam data."""

from __future__ import annotations

import copy
import hashlib
import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi.testclient import TestClient

from avp_api.db.repositories.session_repo import SessionRecord
from avp_api.db.repositories.turn_repo import TurnRecord
from avp_api.main import create_app
from avp_api.routers import actions
from avp_api.services import exam_service, patient_agent

REPO_ROOT = Path(__file__).resolve().parents[3]
CASE = json.loads((REPO_ROOT / "data/cases/case-01-hfmd.json").read_text(encoding="utf-8"))
FINDING = {e["region"]: e["finding"] for e in CASE["exam"]}
GOOD = "good-token"
SID = str(uuid.uuid4())


class FakeSessionRepo:
    def __init__(self, case: dict) -> None:
        self.case = case

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
            state={},
            started_at=datetime.now(UTC),
        )

    def get_case_content(self, case_id: str, version: int) -> dict:
        return self.case


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
        return list(self.rows)


def _client(case: dict = CASE) -> tuple[TestClient, FakeTurnRepo]:
    turns = FakeTurnRepo()
    app = create_app()
    app.dependency_overrides[actions.get_session_repo] = lambda: FakeSessionRepo(case)
    app.dependency_overrides[actions.get_turn_repo] = lambda: turns
    return TestClient(app), turns


def _post(client: TestClient, body: dict, token: str = GOOD):
    return client.post(
        f"/api/v1/sessions/{SID}/actions", json=body, headers={"X-Guest-Token": token}
    )


def test_mouth_finding_is_verbatim_and_turns_persisted() -> None:
    client, turns = _client()
    r = _post(client, {"action": "examine_region", "region": "mouth_throat"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["case_region"] == "mouth"
    assert body["documented"] is True
    assert body["finding"] == FINDING["mouth"]  # verbatim from the case JSON
    assert body["review_status"] == "draft"
    assert [t.speaker for t in turns.rows] == ["student", "system"]
    assert [t.idx for t in turns.rows] == [0, 1]
    assert turns.rows[1].text == FINDING["mouth"]
    assert body["turn_idx"] == 1


def test_skin_regions_share_the_case_skin_finding() -> None:
    for region in ("palm_hands", "feet", "buttocks_knees"):
        client, _ = _client()
        body = _post(client, {"action": "examine_region", "region": region}).json()
        assert body["case_region"] == "skin"
        assert body["finding"] == FINDING["skin"]


def test_observe_child_returns_general_red_flag() -> None:
    client, _ = _client()
    body = _post(client, {"action": "observe_child"}).json()
    assert body["case_region"] == "general"
    assert body["red_flag"] is True
    assert body["finding"] == FINDING["general"]


def test_undocumented_region_is_unknown_not_a_fabricated_negative() -> None:
    no_skin = copy.deepcopy(CASE)
    no_skin["exam"] = [e for e in no_skin["exam"] if e["region"] != "skin"]
    client, turns = _client(no_skin)
    body = _post(client, {"action": "examine_region", "region": "palm_hands"}).json()
    assert body["documented"] is False
    assert body["finding"] is None
    assert turns.rows[1].text == exam_service._UNKNOWN_TRANSCRIPT


def test_examine_region_requires_region() -> None:
    client, _ = _client()
    assert _post(client, {"action": "examine_region"}).status_code == 422


def test_wrong_guest_token_denied() -> None:
    client, _ = _client()
    r = _post(client, {"action": "observe_child"}, token="wrong")
    assert r.status_code == 404


def test_exam_system_turns_are_not_fed_to_the_mother() -> None:
    transcript = [
        {"speaker": "student", "text": "[Khám - miệng - họng] Khám niêm mạc miệng"},
        {"speaker": "system", "text": FINDING["mouth"]},
    ]
    prompt = patient_agent._render_prompt(transcript, "Cháu ăn uống thế nào?")
    assert FINDING["mouth"] not in prompt
