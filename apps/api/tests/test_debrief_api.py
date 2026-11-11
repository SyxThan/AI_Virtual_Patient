"""GET /sessions/{id}/debrief tests (Slice 8, AVP-019). Reuses the Slice 7
in-memory harness; the evaluate -> debrief chain runs through the real worker
code (`execute_job`) with InMemoryRagRepository + FakeEmbeddingProvider."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from avp_api.db.repositories.debrief_repo import DebriefRecord
from avp_api.db.repositories.rag_repo import InMemoryRagRepository
from avp_api.jobs.worker import DebriefDeps, execute_job
from avp_api.providers.embeddings import FakeEmbeddingProvider
from avp_api.providers.llm import FakeLLMProvider, LLMProvider
from avp_api.routers import debriefs
from avp_api.services.rag_corpus import ingest_corpus, load_corpus
from tests.test_evaluation_api import (
    FakeEvalRepo,
    FakeJobRepo,
    FakeSessionRepo,
    FakeTurnRepo,
    Harness,
)

EMB = FakeEmbeddingProvider()
TIERS = ("expected_approach", "rationale", "learning_points", "acceptable_alternatives",
         "important_errors")  # fmt: skip


class FakeDebriefRepo:
    def __init__(self, items: list[DebriefRecord]) -> None:
        self.items = items

    def save(self, *, session_id: str, evaluation_id: str, content: dict) -> DebriefRecord:
        rec = DebriefRecord(id=str(uuid.uuid4()), session_id=session_id,
                            evaluation_id=evaluation_id, content=content,
                            created_at=datetime.now(UTC))  # fmt: skip
        self.items.append(rec)
        return rec

    def latest_for_session(self, session_id: str) -> DebriefRecord | None:
        mine = [d for d in self.items if d.session_id == session_id]
        return mine[-1] if mine else None


class DebriefHarness(Harness):
    def __init__(self, run_jobs: bool = True, chain: bool = True) -> None:
        self.debriefs: list[DebriefRecord] = []
        self.rag = InMemoryRagRepository()
        ingest_corpus(self.rag, EMB, load_corpus())
        self.chain = chain
        super().__init__(run_jobs=run_jobs)
        s = self.store
        ov = self.client.app.dependency_overrides
        ov[debriefs.get_session_repo] = lambda: FakeSessionRepo(s)
        ov[debriefs.get_eval_repo] = lambda: FakeEvalRepo(s)
        ov[debriefs.get_job_repo] = lambda: FakeJobRepo(s)
        ov[debriefs.get_debrief_repo] = lambda: FakeDebriefRepo(self.debriefs)

    def run_job(self, job_id: int) -> None:
        """Same loop as worker.run_job_by_id: run the job, then its follow-up."""
        s = self.store
        deps = DebriefDeps(FakeDebriefRepo(self.debriefs), self.rag, EMB, FakeLLMProvider())
        next_id: int | None = job_id
        while next_id is not None:
            job = FakeJobRepo(s).claim_job(next_id)
            if job is None:
                return
            next_id = execute_job(job, FakeJobRepo(s), FakeSessionRepo(s), FakeTurnRepo(s),
                                  FakeEvalRepo(s), self.evaluator, debrief=deps)  # fmt: skip
            if not self.chain:
                return


def _interview(h: DebriefHarness) -> tuple[str, dict]:
    sid, auth = h.new_session()
    for q in ("Chào chị, cháu sốt mấy ngày rồi ạ?", "Uống thuốc hạ sốt có hạ không chị?"):
        assert h.client.post(f"/api/v1/sessions/{sid}/turns", json={"text": q},
                             headers=auth).status_code == 200  # fmt: skip
    return sid, auth


def test_wrong_guest_token_is_404() -> None:
    h = DebriefHarness()
    sid, auth = _interview(h)
    h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    url = f"/api/v1/sessions/{sid}/debrief"
    assert h.client.get(url, headers={"X-Guest-Token": "not-the-token"}).status_code == 404
    assert h.client.get(url).status_code == 404
    assert h.client.get(url, headers=auth).status_code == 200


def test_active_session_is_409() -> None:
    h = DebriefHarness()
    sid, auth = h.new_session()
    assert h.client.get(f"/api/v1/sessions/{sid}/debrief", headers=auth).status_code == 409


def test_pending_202_until_debrief_job_runs() -> None:
    h = DebriefHarness(run_jobs=False)
    sid, auth = _interview(h)
    h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    url = f"/api/v1/sessions/{sid}/debrief"
    r = h.client.get(url, headers=auth)  # evaluate job still queued
    assert r.status_code == 202 and r.json()["status"] == "pending"

    h.chain = False
    h.run_job(h.store.jobs[0].id)  # evaluate only; debrief job enqueued, not run
    assert [(j.kind, j.status) for j in h.store.jobs] == [("evaluate", "done"),
                                                          ("debrief", "queued")]  # fmt: skip
    assert h.client.get(url, headers=auth).status_code == 202

    h.run_job(h.store.jobs[1].id)
    r = h.client.get(url, headers=auth)
    assert r.status_code == 200 and r.json()["status"] == "done"


def test_end_to_end_finish_evaluate_debrief_with_citations() -> None:
    h = DebriefHarness()
    sid, auth = _interview(h)
    assert h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth).status_code == 200
    assert [(j.kind, j.status) for j in h.store.jobs] == [("evaluate", "done"),
                                                          ("debrief", "done")]  # fmt: skip
    ev = h.client.get(f"/api/v1/sessions/{sid}/evaluation", headers=auth).json()

    r = h.client.get(f"/api/v1/sessions/{sid}/debrief", headers=auth)
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "done" and d["evaluation_id"] == ev["evaluation_id"]
    assert d["practice_feedback_only"] is True and "không phải chứng chỉ" in d["notice"]
    assert d["model"] == "fake-template" and d["embedding_model"] == EMB.model_id
    assert all(d["summary"][t] for t in TIERS)  # all 5 tiers present and non-empty

    # The startle and grading criteria were never asked/stated -> critical errors.
    assert ev["critical_missed"] is True and d["critical_missed"] is True
    errors = " ".join(d["summary"]["important_errors"])
    assert "BỎ SÓT TIÊU CHÍ TRỌNG YẾU" in errors and "giật mình" in errors
    # Overuse reminders for grade 1/2a do not apply to this grade-2b case.
    assert "Chọc dò" not in errors

    items = {i["criterion_id"]: i for i in d["items"]}
    assert "r-fever-hx" not in items  # met and not critical: no feedback claim
    assert items["r-startle-hx"]["verified"] is True
    assert items["r-dx-grade"]["verified"] is True

    # Every citation resolves to a real chunk of the ingested corpus (T-RAG-01).
    chunks = {meta.chunk_id: meta for meta, _vec, _m in h.rag.chunks}
    cited = 0
    for item in d["items"]:
        assert item["verified"] == bool(item["citations"])
        for c in item["citations"]:
            cited += 1
            meta = chunks[c["chunk_id"]]
            assert (c["source_id"], c["section"]) == (meta.source_key, meta.section)
            assert c["document_title"] == meta.document_title and c["quote_excerpt"]
            assert c["review_status"] == "draft"
    assert cited > 0
    assert d["sources_reviewed"] is False  # draft corpus: never shown as verified content
    assert h.store.sessions[sid].status == "evaluated"


def test_failed_evaluation_gives_failed_debrief_not_endless_pending() -> None:
    h = DebriefHarness()
    h.evaluator = _BrokenLLM()
    sid, auth = _interview(h)
    h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    assert [j.kind for j in h.store.jobs] == ["evaluate"]  # no debrief after a failure
    r = h.client.get(f"/api/v1/sessions/{sid}/debrief", headers=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "failed" and body["error"] and body["summary"] is None


class _BrokenLLM(LLMProvider):
    model_id = "broken"

    def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
        return "not json"
