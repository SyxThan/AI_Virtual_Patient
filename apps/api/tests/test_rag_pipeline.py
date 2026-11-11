"""RAG pipeline tests (Slice 8, AVP-017/018/019): rights gate (T-RAG-03),
retrieval traceability (T-RAG-01) and the citation verifier (T-RAG-02).
Offline: FakeEmbeddingProvider + InMemoryRagRepository, synthetic data only."""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime

import pytest

from avp_api.db.repositories.evaluation_repo import EvaluationRecord
from avp_api.db.repositories.rag_repo import (
    RIGHTS_ERROR,
    ChunkIn,
    DocumentIn,
    InMemoryRagRepository,
)
from avp_api.providers.embeddings import (
    EMBEDDING_DIM,
    FakeEmbeddingProvider,
    get_embedding_provider,
)
from avp_api.providers.llm import FakeLLMProvider, LLMProvider
from avp_api.schemas.debrief import LLMClaim
from avp_api.schemas.evaluation import VerifiedCriterion
from avp_api.services.debrief_agent import generate_debrief, verify_citations
from avp_api.services.rag_corpus import DEFAULT_CORPUS, REPO_ROOT, ingest_corpus, load_corpus

EMB = FakeEmbeddingProvider()
CASE = json.loads((REPO_ROOT / "data/cases/case-01-hfmd.json").read_text("utf-8"))


def _corpus_repo() -> InMemoryRagRepository:
    repo = InMemoryRagRepository()
    results = ingest_corpus(repo, EMB, load_corpus())
    assert set(results.values()) == {"inserted"}
    return repo


def _search(repo: InMemoryRagRepository, query: str, k: int = 3):
    return repo.search_chunks(EMB.embed([query], kind="query")[0], EMB.model_id, top_k=k)


def test_fake_embedding_is_deterministic_unit_length_768() -> None:
    a, b = EMB.embed(["Cháu có hay giật mình không?", "Cháu có hay giật mình không?"])
    assert a == b and len(a) == EMBEDDING_DIM
    assert math.isclose(math.sqrt(sum(x * x for x in a)), 1.0, rel_tol=1e-9)
    assert EMB.embed(["   "])[0] == [0.0] * EMBEDDING_DIM  # nothing to hash


def test_embedding_factory_falls_back_to_fake_without_key(monkeypatch) -> None:
    from avp_api.config import Settings
    from avp_api.providers import embeddings

    def settings(**kw):
        return lambda: Settings(_env_file=None, **kw)

    monkeypatch.setattr(
        embeddings, "get_settings", settings(llm_provider="gemini", llm_api_key=None)
    )
    assert isinstance(get_embedding_provider(), FakeEmbeddingProvider)
    monkeypatch.setattr(
        embeddings,
        "get_settings",
        settings(llm_provider="gemini", llm_api_key="k", embedding_model="emb-model"),
    )
    real = get_embedding_provider()
    assert real.model_id == "emb-model" and real.dimension == EMBEDDING_DIM  # not called


def test_t_rag_03_unverified_rights_document_is_refused() -> None:
    repo = InMemoryRagRepository()
    doc = DocumentIn(
        source_key="unverified-blog",
        title="Bài viết chưa rõ bản quyền",
        publisher=None,
        year=2024,
        license_note=None,
        rights_checked=False,
        chunks=[ChunkIn(section="x", text="Giật mình độ 2a")],
    )
    with pytest.raises(ValueError, match=RIGHTS_ERROR):
        repo.ingest_document(doc, EMB.embed(["Giật mình độ 2a"]), EMB.model_id)
    assert repo.docs == {} and repo.chunks == []
    # The corpus ingester reports and skips it, without embedding it.
    out = ingest_corpus(repo, EMB, [doc])
    assert out["unverified-blog"].startswith("refused")
    assert repo.chunks == []


def test_corpus_file_is_rights_checked_and_marked_draft() -> None:
    raw = json.loads(DEFAULT_CORPUS.read_text("utf-8"))
    assert raw["review"]["status"] == "draft"  # Hard Rule 2 until a clinician signs off
    docs = load_corpus()
    assert {d.source_key for d in docs} == {"moh-qd-1003-2012", "htd-hcm-2023-bai20"}
    assert all(d.rights_checked and d.review_status == "draft" for d in docs)
    assert sum(len(d.chunks) for d in docs) >= 8


def test_ingest_is_idempotent() -> None:
    repo = _corpus_repo()
    n = len(repo.chunks)
    assert set(ingest_corpus(repo, EMB, load_corpus()).values()) == {"unchanged"}
    assert len(repo.chunks) == n


def test_t_rag_01_startle_grade_2a_query_hits_grading_chunk_with_metadata() -> None:
    top = _search(_corpus_repo(), "giật mình độ 2a")[0]
    assert top.source_key == "moh-qd-1003-2012"
    assert top.section == "Phân độ lâm sàng - Độ 2a"
    assert "giật mình" in top.text and top.document_title and top.year == 2012
    assert top.score > 0.3


def test_vectors_from_another_model_are_never_compared() -> None:
    repo = _corpus_repo()
    q = EMB.embed(["giật mình độ 2a"], kind="query")[0]
    assert repo.search_chunks(q, "some-other-model", top_k=3) == []


def test_t_rag_02_verifier_drops_fabricated_source_ids() -> None:
    repo = _corpus_repo()
    real = _search(repo, "giật mình độ 2a", k=1)[0]
    sources = {"S1": real}
    claims = [
        LLMClaim(text="Phân độ 2a.", criterion_id="r-dx-grade", source_ids=["s1", "S1", "S9"]),
        LLMClaim(text="Bịa nguồn.", criterion_id="r-not-real", source_ids=["S99", real.chunk_id]),
        LLMClaim(text="Không có nguồn.", source_ids=[]),
    ]
    out = verify_citations(claims, sources, {"r-dx-grade"})
    assert out[0].verified is True and len(out[0].citations) == 1  # deduped, S9 dropped
    c = out[0].citations[0]
    assert (c.source_id, c.chunk_id, c.section) == (real.source_key, real.chunk_id, real.section)
    assert c.quote_excerpt == real.text and c.review_status == "draft"
    # An unknown alias, or a raw id that was not offered to the model, never survives.
    assert out[1].verified is False and out[1].citations == [] and out[1].criterion_id is None
    assert out[2].verified is False and out[2].citations == []


def _evaluation(statuses: dict[str, str]) -> EvaluationRecord:
    lv = {"met": 2, "partial": 1, "unmet": 0, "insufficient_evidence": None}
    items = [
        VerifiedCriterion(
            criterion_id=cid, level=lv[st], status=st, evidence=[], feedback="", flagged=False
        )
        for cid, st in statuses.items()
    ]
    return EvaluationRecord(
        id="eval-1", session_id="s-1", status="done", model="fake-heuristic",
        prompt_version="evaluator-v1", rubric_version=1, scoring_version="1.0.0",
        total_score=20.0, critical_missed=True, error=None, created_at=datetime.now(UTC),
        items=items,
    )  # fmt: skip


class _ScriptedLLM(LLMProvider):
    model_id = "scripted-debrief"

    def __init__(self, output: str) -> None:
        self.output = output
        self.prompts: list[str] = []

    def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
        self.prompts.append(prompt)
        return self.output


def test_llm_debrief_fabricated_citation_is_unverified() -> None:
    statuses = {c["id"]: "unmet" for c in CASE["rubric"]["items"]}
    llm_out = {
        "summary": {
            "expected_approach": "a", "rationale": "b", "learning_points": ["c"],
            "acceptable_alternatives": "d", "important_errors": ["e"],
        },
        "items": [
            {"text": "Hỏi giật mình để phân độ.", "criterion_id": "r-startle-hx",
             "source_ids": ["S1"]},
            {"text": "Liều thuốc bịa.", "criterion_id": "r-management", "source_ids": ["S42"]},
        ],
    }  # fmt: skip
    llm = _ScriptedLLM(json.dumps(llm_out, ensure_ascii=False))
    out = generate_debrief(CASE, _evaluation(statuses), [], _corpus_repo(), EMB, llm)
    assert "NGUỒN" in llm.prompts[0] and '"S1"' in llm.prompts[0]
    assert out.model == "scripted-debrief"
    assert out.items[0].verified is True and out.items[0].citations
    assert out.items[1].verified is False and out.items[1].citations == []
    assert out.sources_reviewed is False  # corpus is still a draft


def test_off_corpus_retrieval_gives_no_citation() -> None:
    """A criterion the guidelines do not cover gets no citation, not a forced one."""
    case = {"rubric": {"version": 1, "items": [{
        "id": "r-car", "domain": "communication", "criterion": "Cách thay lốp xe ô tô",
        "weight": 1, "critical": False, "anchors": {"2": "Thay lốp xe đúng quy trình"},
    }]}}  # fmt: skip
    out = generate_debrief(
        case, _evaluation({"r-car": "unmet"}), [], _corpus_repo(), EMB, FakeLLMProvider()
    )
    assert len(out.items) == 1
    assert out.items[0].verified is False and out.items[0].citations == []
