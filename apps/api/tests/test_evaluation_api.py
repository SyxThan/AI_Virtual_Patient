"""Finish / evaluation API tests (Slice 7, AVP-014). In-memory repositories that
mirror the DB rules (evaluation_items CHECKs, atomic finish), synthetic turns."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi.testclient import TestClient

from avp_api.db.repositories.evaluation_repo import EvaluationRecord, check_item
from avp_api.db.repositories.job_repo import JobRecord
from avp_api.db.repositories.session_repo import SessionRecord
from avp_api.db.repositories.turn_repo import TurnRecord
from avp_api.jobs.worker import execute_job
from avp_api.main import create_app
from avp_api.providers.llm import FakeLLMProvider, LLMProvider
from avp_api.routers import actions, evaluations, sessions, turns
from avp_api.services.evidence_verifier import normalize_text

CASE = json.loads(
    (Path(__file__).resolve().parents[3] / "data/cases/case-01-hfmd.json").read_text("utf-8")
)
RUBRIC_IDS = [c["id"] for c in CASE["rubric"]["items"]]


class Store:
    def __init__(self) -> None:
        self.sessions: dict[str, SessionRecord] = {}
        self.turns: list[TurnRecord] = []
        self.evals: list[EvaluationRecord] = []
        self.jobs: list[JobRecord] = []


class FakeSessionRepo:
    def __init__(self, s: Store) -> None:
        self.s = s

    def active_case_version(self, case_id: str) -> int | None:
        return 1 if case_id == "case-01-hfmd" else None

    def get_case_content(self, case_id: str, version: int) -> dict:
        return CASE

    def create(self, **kw) -> SessionRecord:
        rec = SessionRecord(id=str(uuid.uuid4()), started_at=datetime.now(UTC), **kw)
        self.s.sessions[rec.id] = rec
        return rec

    def get(self, session_id: str) -> SessionRecord | None:
        return self.s.sessions.get(session_id)

    def update_state(self, session_id: str, state: dict) -> None:
        self.s.sessions[session_id].state = state

    def set_status(self, session_id: str, status: str) -> None:
        self.s.sessions[session_id].status = status


class FakeTurnRepo:
    def __init__(self, s: Store) -> None:
        self.s = s

    def next_idx(self, session_id: str) -> int:
        return len(self.list_for_session(session_id))

    def add(self, **kw) -> TurnRecord:
        kw.pop("guardrail", None)
        rec = TurnRecord(id=len(self.s.turns) + 1, created_at=datetime.now(UTC), **kw)
        self.s.turns.append(rec)
        return rec

    def list_for_session(self, session_id: str) -> list[TurnRecord]:
        return [t for t in self.s.turns if t.session_id == session_id]


class FakeEvalRepo:
    def __init__(self, s: Store) -> None:
        self.s = s

    def save(self, *, items, **kw) -> EvaluationRecord:
        for v in items:
            check_item(v)  # same rules the Postgres CHECKs enforce
        rec = EvaluationRecord(
            id=str(uuid.uuid4()), created_at=datetime.now(UTC), items=list(items), **kw
        )
        self.s.evals.append(rec)
        return rec

    def latest_for_session(self, session_id: str) -> EvaluationRecord | None:
        mine = [e for e in self.s.evals if e.session_id == session_id]
        return mine[-1] if mine else None


class FakeJobRepo:
    def __init__(self, s: Store) -> None:
        self.s = s

    def enqueue_job(self, kind: str, session_id: str) -> int:
        job = JobRecord(id=len(self.s.jobs) + 1, kind=kind, session_id=session_id,
                        status="queued", attempts=0)  # fmt: skip
        self.s.jobs.append(job)
        return job.id

    def transition_and_enqueue(self, session_id, from_statuses, to_status, kind):
        sess = self.s.sessions[session_id]
        if sess.status not in from_statuses:
            return None
        sess.status = to_status
        return self.enqueue_job(kind, session_id)

    def claim_job(self, job_id: int) -> JobRecord | None:
        job = next((j for j in self.s.jobs if j.id == job_id and j.status == "queued"), None)
        if job:
            job.status, job.attempts = "running", job.attempts + 1
        return job

    def claim_next_job(self) -> JobRecord | None:
        job = next((j for j in self.s.jobs if j.status == "queued"), None)
        return self.claim_job(job.id) if job else None

    def mark_done(self, job_id: int) -> None:
        self.s.jobs[job_id - 1].status = "done"

    def mark_failed(self, job_id: int, error: str) -> None:
        self.s.jobs[job_id - 1].status = "failed"

    def has_open_job(self, session_id: str, kind: str) -> bool:
        return any(
            j.session_id == session_id and j.kind == kind and j.status in ("queued", "running")
            for j in self.s.jobs
        )


class Harness:
    def __init__(self, evaluator: LLMProvider | None = None, run_jobs: bool = True) -> None:
        self.store = Store()
        self.evaluator: LLMProvider = evaluator or FakeLLMProvider()
        s = self.store
        app = create_app()
        ov = app.dependency_overrides
        for mod in (sessions, turns, actions, evaluations):
            ov[mod.get_session_repo] = lambda: FakeSessionRepo(s)
        for mod in (turns, actions):
            ov[mod.get_turn_repo] = lambda: FakeTurnRepo(s)
        ov[turns.get_provider] = lambda: FakeLLMProvider()  # patient: offline
        ov[evaluations.get_eval_repo] = lambda: FakeEvalRepo(s)
        ov[evaluations.get_job_repo] = lambda: FakeJobRepo(s)
        ov[evaluations.get_job_runner] = lambda: self.run_job if run_jobs else (lambda _id: None)
        self.client = TestClient(app)

    def run_job(self, job_id: int) -> None:
        s = self.store
        job = FakeJobRepo(s).claim_job(job_id)
        if job:
            execute_job(job, FakeJobRepo(s), FakeSessionRepo(s), FakeTurnRepo(s),
                        FakeEvalRepo(s), self.evaluator)  # fmt: skip

    def new_session(self) -> tuple[str, dict]:
        r = self.client.post("/api/v1/sessions", json={"consent": True})
        assert r.status_code == 201
        body = r.json()
        return body["id"], {"X-Guest-Token": body["guest_token"]}


def test_finish_is_idempotent_single_job() -> None:
    h = Harness(run_jobs=False)
    sid, auth = h.new_session()
    r1 = h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    r2 = h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["status"] == r2.json()["status"] == "completed"
    assert len(h.store.jobs) == 1 and h.store.jobs[0].kind == "evaluate"
    # Job still queued -> 202 pending.
    r = h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=auth)
    assert r.status_code == 202 and r.json()["status"] == "pending"


def test_ownership_wrong_token_is_404() -> None:
    h = Harness()
    sid, auth = h.new_session()
    h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    bad = {"X-Guest-Token": "not-the-token"}
    assert h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=bad).status_code == 404
    assert h.client.post(f"/api/v1/sessions/{sid}/finish", headers=bad).status_code == 404
    assert h.client.get(f"/api/v1/sessions/{sid}/evaluation").status_code == 404


def test_evaluation_before_finish_is_409_and_turns_after_finish_are_blocked() -> None:
    h = Harness()
    sid, auth = h.new_session()
    assert h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=auth).status_code == 409
    h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    r = h.client.post(f"/api/v1/sessions/{sid}/turns", json={"text": "Chào chị"}, headers=auth)
    assert r.status_code == 409


def test_end_to_end_chat_exam_finish_evaluation() -> None:
    h = Harness()
    sid, auth = h.new_session()
    for q in (
        "Chào chị, cháu sốt mấy ngày rồi ạ?",
        "Chị cho cháu uống thuốc hạ sốt thì có hạ không?",
        "Cháu có hay giật mình không, giật mình lúc nằm yên hay lúc ngủ?",
    ):
        r = h.client.post(f"/api/v1/sessions/{sid}/turns", json={"text": q}, headers=auth)
        assert r.status_code == 200
    r = h.client.post(
        f"/api/v1/sessions/{sid}/actions",
        json={"action": "examine_region", "region": "mouth_throat"},
        headers=auth,
    )
    assert r.status_code == 200

    r = h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    assert r.status_code == 200
    r = h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=auth)
    assert r.status_code == 200
    ev = r.json()
    assert ev["status"] == "done"
    assert ev["practice_feedback_only"] is True and "không phải" in ev["notice"]
    assert ev["model"] == "fake-heuristic" and ev["scoring_version"] == "1.0.0"
    assert [c["criterion_id"] for c in ev["criteria"]] == RUBRIC_IDS
    assert h.store.sessions[sid].status == "evaluated"

    by_id = {c["criterion_id"]: c for c in ev["criteria"]}
    assert by_id["r-fever-hx"]["status"] == "met"
    assert by_id["r-startle-hx"]["status"] in ("met", "partial")
    assert by_id["r-exam-skin-mouth"]["status"] in ("met", "partial")
    assert by_id["r-dx-grade"]["status"] == "unmet"
    assert ev["critical_missed"] is True  # diagnosis/grading never stated
    assert 0 < ev["total_score"] < 100

    # Every credited criterion cites a real student turn, verbatim.
    turns_by_idx = {t.idx: t for t in h.store.turns if t.session_id == sid}
    for c in ev["criteria"]:
        if c["status"] in ("met", "partial"):
            assert c["evidence"]
        for e in c["evidence"]:
            t = turns_by_idx[e["turn_idx"]]
            assert t.speaker == "student"
            assert normalize_text(e["quote"]) in normalize_text(t.text)


class _ScriptedLLM(LLMProvider):
    model_id = "scripted-test-model"

    def __init__(self, outputs: list[str]) -> None:
        self.outputs = outputs
        self.calls = 0

    def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
        self.calls += 1
        assert temperature == 0.1
        return self.outputs[min(self.calls - 1, len(self.outputs) - 1)]


def test_invalid_output_twice_fails_then_retry_succeeds_with_fabrication_flagged() -> None:
    bad = _ScriptedLLM(["not json at all"])
    h = Harness(evaluator=bad)
    sid, auth = h.new_session()
    h.client.post(f"/api/v1/sessions/{sid}/turns", json={"text": "Cháu sốt mấy ngày rồi chị?"},
                  headers=auth)  # fmt: skip
    h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    assert bad.calls == 2  # first try + exactly one retry
    r = h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "failed" and body["error"] and body["total_score"] is None
    assert "Traceback" not in body["error"]

    proposal = {
        "items": [
            {"criterion_id": "r-fever-hx", "level": 2, "feedback": "Tốt.",
             "evidence": [{"turn_idx": 0, "quote": "cháu  SỐT mấy ngày"}]},
            # Fabricated quote + patient turn: must be downgraded and flagged.
            {"criterion_id": "r-startle-hx", "level": 2, "feedback": "x",
             "evidence": [{"turn_idx": 0, "quote": "Cháu có co giật không?"},
                          {"turn_idx": 1, "quote": "Dạ"}]},
            {"criterion_id": "r-not-in-rubric", "level": 2, "evidence": [], "feedback": ""},
        ]
    }  # fmt: skip
    h.evaluator = _ScriptedLLM(["```json\n" + json.dumps(proposal, ensure_ascii=False) + "\n```"])
    r = h.client.post(f"/api/v1/sessions/{sid}/evaluation/retry", headers=auth)
    assert r.status_code == 200
    ev = h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=auth).json()
    assert ev["status"] == "done" and ev["model"] == "scripted-test-model"
    by_id = {c["criterion_id"]: c for c in ev["criteria"]}
    assert set(by_id) == set(RUBRIC_IDS)
    assert by_id["r-fever-hx"]["status"] == "met"
    startle = by_id["r-startle-hx"]
    assert (startle["status"], startle["level"], startle["flagged"]) == (
        "insufficient_evidence",
        None,
        True,
    )
    assert by_id["r-dx-grade"]["flagged"] is True  # not reported by the LLM
    assert ev["critical_missed"] is True
    # weight 1 of 14 met -> 7.14
    assert ev["total_score"] == 7.14
    # A second retry is not allowed once done.
    assert (
        h.client.post(f"/api/v1/sessions/{sid}/evaluation/retry", headers=auth).status_code == 409
    )


def test_offline_heuristic_keeps_exam_actions_out_of_history_criteria() -> None:
    h = Harness()
    sid, auth = h.new_session()
    exam = {"action": "examine_region", "region": "palm_hands"}
    h.client.post(f"/api/v1/sessions/{sid}/actions", json=exam, headers=auth)
    h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    ev = h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=auth).json()
    by_id = {c["criterion_id"]: c for c in ev["criteria"]}
    assert by_id["r-exam-skin-mouth"]["status"] in ("met", "partial")
    assert by_id["r-startle-hx"]["status"] == "unmet"


def test_empty_transcript_is_insufficient_evidence_not_unmet() -> None:
    h = Harness()
    sid, auth = h.new_session()
    h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    ev = h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=auth).json()
    assert {c["status"] for c in ev["criteria"]} == {"insufficient_evidence"}
    assert ev["total_score"] == 0.0 and ev["critical_missed"] is True
