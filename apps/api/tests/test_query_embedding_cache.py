"""Debrief query-embedding cache (AVP-167). Fake embedder only, no network."""

from __future__ import annotations

import pytest

from avp_api.providers.embeddings import (
    FakeEmbeddingProvider,
    embed_queries,
    query_cache,
)


class _CountingEmbedder(FakeEmbeddingProvider):
    def __init__(self, model_id: str = "fake-hash-768") -> None:
        self.model_id = model_id
        self.calls: list[tuple[list[str], str]] = []

    def embed(self, texts, kind="document"):
        self.calls.append((list(texts), kind))
        return super().embed(texts, kind)


def test_second_debrief_with_same_queries_makes_no_embedding_call() -> None:
    e = _CountingEmbedder()
    qs = ["hỏi sốt bao nhiêu ngày", "hỏi dấu hiệu giật mình"]
    first = embed_queries(e, qs)
    again = embed_queries(e, qs)
    assert again == first
    assert e.calls == [(qs, "query")]  # one batched call, kind=query
    assert first == FakeEmbeddingProvider().embed(qs, kind="query")


def test_only_new_queries_reach_the_provider_and_order_is_kept() -> None:
    e = _CountingEmbedder()
    embed_queries(e, ["a sốt", "b ban"])
    out = embed_queries(e, ["c loét", "a sốt", "c loét"])
    assert e.calls[-1] == (["c loét"], "query")  # deduplicated, cached one skipped
    ref = FakeEmbeddingProvider().embed(["c loét", "a sốt", "c loét"], kind="query")
    assert out == ref


def test_cache_is_per_model() -> None:
    a, b = _CountingEmbedder("model-a"), _CountingEmbedder("model-b")
    embed_queries(a, ["sốt"])
    embed_queries(b, ["sốt"])
    assert len(a.calls) == 1 and len(b.calls) == 1
    assert len(query_cache()) == 2


def test_provider_failure_caches_nothing() -> None:
    class _Boom(FakeEmbeddingProvider):
        def embed(self, texts, kind="document"):
            raise RuntimeError("quota")

    with pytest.raises(RuntimeError):
        embed_queries(_Boom(), ["sốt"])
    assert len(query_cache()) == 0


def test_cached_vectors_cannot_be_mutated_by_callers() -> None:
    e = _CountingEmbedder()
    v = embed_queries(e, ["sốt"])[0]
    v[0] = 99.0
    assert embed_queries(e, ["sốt"])[0][0] != 99.0
