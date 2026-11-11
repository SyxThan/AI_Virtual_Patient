"""Practice history and progress (Slice 11, AVP-109; quality-gates T-HIST-01).

Synthetic data only. Users are authenticated with a fake verifier (the shared
auth contract); sessions are created through POST /api/v1/sessions; evaluations
are written straight into the in-memory store with synthetic evidence.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import HTTPException
from fastapi.testclient import TestClient

from avp_api import auth
from avp_api.db.repositories.evaluation_repo import EvaluationRecord
from avp_api.db.repositories.history_repo import InMemoryHistoryRepository
from avp_api.db.repositories.session_repo import SessionRecord
from avp_api.main import create_app
from avp_api.routers import sessions
from avp_api.schemas.evaluation import PRACTICE_NOTICE, EvidenceItem, VerifiedCriterion

CASE = json.loads(
    (Path(__file__).resolve().parents[3] / "data/cases/case-01-hfmd.json").read_text("utf-8")
)
RUBRIC_IDS = [c["id"] for c in CASE["rubric"]["items"]]

USERS = {
    "user-a": "00000000-0000-4000-8000-00000000000a",
    "user-b": "00000000-0000-4000-8000-00000000000b",
}
A = {"Authorization": "Bearer user-a"}
B = {"Authorization": "Bearer user-b"}


class FakeVerifier:
    def verify(self, token: str) -> str:
        if token not in USERS:
            raise HTTPException(status_code=401, detail={"code": "INVALID_TOKEN", "message": "x"})
        return USERS[token]


class Store:
    def __init__(self) -> None:
        self.sessions: dict[str, SessionRecord] = {}
        self.evals: list[EvaluationRecord] = []
        self.clock = datetime(2026, 1, 1, tzinfo=UTC)


class FakeSessionRepo:
    def __init__(self, s: Store) -> None:
        self.s = s

    def active_case_version(self, case_id: str) -> int | None:
        return 1 if case_id == "case-01-hfmd" else None

    def get_case_content(self, case_id: str, version: int) -> dict:
        return CASE

    def create(self, **kw) -> SessionRecord:
        self.s.clock += timedelta(minutes=1)
        rec = SessionRecord(id=str(uuid.uuid4()), started_at=self.s.clock, **kw)
        self.s.sessions[rec.id] = rec
        return rec

    def get(self, session_id: str) -> SessionRecord | None:
        return self.s.sessions.get(session_id)

    def update_state(self, session_id: str, state: dict) -> None:
        self.s.sessions[session_id].state = state

    def set_status(self, session_id: str, status: str) -> None:
        self.s.sessions[session_id].status = status


class Harness:
    def __init__(self) -> None:
        self.store = s = Store()
        app = create_app()
        ov = app.dependency_overrides
        ov[auth.get_verifier] = lambda: FakeVerifier()
        ov[sessions.get_session_repo] = lambda: FakeSessionRepo(s)
        ov[sessions.get_history_repo] = lambda: InMemoryHistoryRepository(
            s.sessions, s.evals, {("case-01-hfmd", 1): CASE}
        )
        self.client = TestClient(app)

    def new_session(self, headers: dict, mode: str = "guided") -> str:
        r = self.client.post(
            "/api/v1/sessions", json={"consent": True, "mode": mode}, headers=headers
        )
        assert r.status_code == 201, r.text
        return r.json()["id"]

    def add_eval(
        self,
        sid: str,
        status: str = "done",
        score: float | None = 50.0,
        critical: bool = False,
        statuses: dict[str, str] | None = None,
        rubric_version: int = 1,
    ) -> None:
        self.store.clock += timedelta(seconds=1)
        items = []
        for cid, st in (statuses or {}).items():
            level = {"met": 2, "partial": 1, "unmet": 0, "insufficient_evidence": None}[st]
            ev = [EvidenceItem(turn_idx=0, quote="synthetic")] if st in ("met", "partial") else []
            items.append(
                VerifiedCriterion(
                    criterion_id=cid,
                    level=level,
                    status=st,
                    evidence=ev,
                    feedback="",
                    flagged=False,
                )  # fmt: skip
            )
        self.store.sessions[sid].status = "evaluated" if status == "done" else "failed"
        self.store.evals.append(
            EvaluationRecord(
                id=str(uuid.uuid4()),
                session_id=sid,
                status=status,
                model="fake",
                prompt_version="p1",
                rubric_version=rubric_version,
                scoring_version="s1",
                total_score=score if status == "done" else None,
                critical_missed=critical,
                error=None if status == "done" else "llm_error",
                created_at=self.store.clock,
                items=items,
            )  # fmt: skip
        )


def test_guest_gets_401_auth_required() -> None:
    h = Harness()
    for path in ("/api/v1/sessions", "/api/v1/sessions/progress"):
        r = h.client.get(path)
        assert r.status_code == 401
        assert r.json()["error"]["code"] == "AUTH_REQUIRED"


def test_user_sees_only_own_sessions_and_no_transcript() -> None:
    h = Harness()
    a_ids = {h.new_session(A) for _ in range(3)}
    b_ids = {h.new_session(B) for _ in range(2)}
    h.new_session({})  # a guest session is nobody's history

    ra = h.client.get("/api/v1/sessions", headers=A).json()
    rb = h.client.get("/api/v1/sessions", headers=B).json()
    assert {i["id"] for i in ra["items"]} == a_ids
    assert {i["id"] for i in rb["items"]} == b_ids
    assert ra["next_cursor"] is None
    item = ra["items"][0]
    assert item["case_title"] == CASE["title"]["vi"]
    assert item["evaluation_status"] == "none" and item["total_score"] is None
    for forbidden in ("transcript", "turns", "state", "guest_token", "user_id"):
        assert forbidden not in item

    # Another user's session id is still not reachable by detail route.
    other = next(iter(b_ids))
    assert h.client.get(f"/api/v1/sessions/{other}", headers=A).status_code == 404


def test_25_sessions_paginate_20_then_5_newest_first() -> None:
    h = Harness()
    created = [h.new_session(A) for _ in range(25)]
    for _ in range(3):
        h.new_session(B)

    p1 = h.client.get("/api/v1/sessions", headers=A).json()
    assert len(p1["items"]) == 20 and p1["next_cursor"]
    p2 = h.client.get("/api/v1/sessions", params={"cursor": p1["next_cursor"]}, headers=A).json()
    assert len(p2["items"]) == 5 and p2["next_cursor"] is None

    ids = [i["id"] for i in p1["items"] + p2["items"]]
    assert len(set(ids)) == 25
    assert ids == list(reversed(created))  # newest first
    started = [i["started_at"] for i in p1["items"] + p2["items"]]
    assert started == sorted(started, reverse=True)

    # Stable: asking again returns the same pages.
    again = h.client.get("/api/v1/sessions", headers=A).json()
    assert [i["id"] for i in again["items"]] == ids[:20]
    assert again["next_cursor"] == p1["next_cursor"]


def test_limit_and_bad_cursor_are_rejected() -> None:
    h = Harness()
    h.new_session(A)
    for limit in (0, 51):
        assert (
            h.client.get("/api/v1/sessions", params={"limit": limit}, headers=A).status_code == 422
        )
    for bad in ("not-base64!!", "eyJ4IjoxfQ", "e30"):
        r = h.client.get("/api/v1/sessions", params={"cursor": bad}, headers=A)
        assert r.status_code == 400 and r.json()["error"]["code"] == "INVALID_CURSOR"
    r = h.client.get("/api/v1/sessions", params={"limit": 1}, headers=A).json()
    assert len(r["items"]) == 1


def test_evaluation_status_and_score_reflect_stored_evaluation() -> None:
    h = Harness()
    s_none = h.new_session(A)
    s_done = h.new_session(A, mode="exam")
    s_failed = h.new_session(A)
    s_eval = h.new_session(A)
    h.add_eval(s_done, score=72.5, critical=True)
    h.add_eval(s_failed, status="failed")
    h.store.sessions[s_eval].status = "evaluating"

    items = {i["id"]: i for i in h.client.get("/api/v1/sessions", headers=A).json()["items"]}
    assert items[s_none]["evaluation_status"] == "none"
    assert items[s_done]["evaluation_status"] == "done"
    assert items[s_done]["total_score"] == 72.5 and items[s_done]["critical_missed"] is True
    assert items[s_done]["mode"] == "exam" and items[s_done]["status"] == "evaluated"
    assert items[s_failed]["evaluation_status"] == "failed"
    assert items[s_failed]["total_score"] is None
    assert items[s_eval]["evaluation_status"] == "pending"


def test_progress_counts_only_done_evaluations() -> None:
    h = Harness()
    c1, c2, c3 = RUBRIC_IDS[:3]
    s1 = h.new_session(A)
    s2 = h.new_session(A)
    s3 = h.new_session(A)
    s_failed = h.new_session(A)
    h.new_session(A)  # never evaluated
    s_b = h.new_session(B)
    h.add_eval(s1, score=40.0, statuses={c1: "met", c2: "unmet", c3: "partial"})
    h.add_eval(s2, score=60.0, critical=True, statuses={c1: "met", c2: "partial"})
    h.add_eval(s3, score=90.0, statuses={c1: "partial", c2: "met", c3: "met"}, rubric_version=2)
    h.add_eval(s_failed, status="failed")
    h.add_eval(s_b, score=100.0, statuses={c1: "met", c2: "met", c3: "met"})

    body = h.client.get("/api/v1/sessions/progress", headers=A).json()
    assert body["practice_feedback_only"] is True and body["notice"] == PRACTICE_NOTICE
    attempts = body["attempts"]
    assert [a["session_id"] for a in attempts] == [s1, s2, s3]  # chronological, done only
    assert [a["total_score"] for a in attempts] == [40.0, 60.0, 90.0]
    assert [a["critical_missed"] for a in attempts] == [False, True, False]
    assert [a["rubric_version"] for a in attempts] == [1, 1, 2]

    groups = {g["rubric_version"]: g["criteria"] for g in body["rubric_groups"]}
    assert sorted(groups) == [1, 2]
    v1 = {c["criterion_id"]: c for c in groups[1]}
    assert (v1[c1]["attempts"], v1[c1]["met"], v1[c1]["partial"]) == (2, 2, 0)
    assert (v1[c2]["attempts"], v1[c2]["met"], v1[c2]["partial"]) == (2, 0, 1)
    assert (v1[c3]["attempts"], v1[c3]["met"], v1[c3]["partial"]) == (1, 0, 1)
    assert v1[c1]["criterion"] == CASE["rubric"]["items"][0]["criterion"]
    assert [c["criterion_id"] for c in groups[1]] == [c1, c2, c3]  # rubric order
    v2 = {c["criterion_id"]: c for c in groups[2]}
    assert (v2[c1]["met"], v2[c1]["partial"], v2[c3]["met"]) == (0, 1, 1)

    # User B's numbers never leak into A's progress, and vice versa.
    b = h.client.get("/api/v1/sessions/progress", headers=B).json()
    assert [a["session_id"] for a in b["attempts"]] == [s_b]


def test_progress_empty_for_new_user() -> None:
    h = Harness()
    body = h.client.get("/api/v1/sessions/progress", headers=A).json()
    assert body["attempts"] == [] and body["rubric_groups"] == []
    # The only certificate wording allowed is the existing negated disclaimer.
    assert body["notice"] == PRACTICE_NOTICE and "không phải" in body["notice"]
