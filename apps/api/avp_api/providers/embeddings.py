"""Embedding provider adapter (Slice 8, AVP-018; ADR-0005, ADR-0006).

Same pattern as llm.py: one interface, an offline `FakeEmbeddingProvider` for
dev/tests (no network, no key) and a lazily imported Gemini provider selected by
env. The dimension is fixed at 768 to match `source_chunks.embedding vector(768)`.

Every chunk is stored with the `model_id` that embedded it and retrieval only
compares vectors from the same model, so swapping models can never silently mix
incompatible vector spaces (re-run `scripts/ingest_guidelines.py` instead).
"""

from __future__ import annotations

import hashlib
import math
import re
import unicodedata
from abc import ABC, abstractmethod
from typing import Literal

from avp_api.config import get_settings
from avp_api.providers.cache import BoundedLRU

EMBEDDING_DIM = 768
EmbedKind = Literal["document", "query"]


def l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec))
    return [x / norm for x in vec] if norm > 0 else vec


class EmbeddingProvider(ABC):
    dimension: int = EMBEDDING_DIM
    model_id: str = "unknown"

    @abstractmethod
    def embed(self, texts: list[str], kind: EmbedKind = "document") -> list[list[float]]:
        """One L2-normalised vector of `dimension` floats per input text."""


# Function syllables that carry no topic; dropped so they do not dominate overlap.
_STOP = {
    "có", "không", "và", "là", "của", "cho", "các", "những", "một", "này", "đó", "khi",
    "thì", "được", "với", "hay", "hoặc", "ở", "trong", "theo", "trẻ", "cháu", "bé", "bị",
    "ạ", "nhé", "gì", "nào", "rồi", "cần", "như", "từ", "đến", "lần", "ra", "để",
}  # fmt: skip


def _tokens(text: str) -> list[str]:
    norm = unicodedata.normalize("NFC", text).casefold()
    return [w for w in re.findall(r"\w+", norm) if w not in _STOP]


class FakeEmbeddingProvider(EmbeddingProvider):
    """Deterministic feature hashing over syllable unigrams + bigrams.

    Vietnamese terms are multi-syllable ("giật mình", "độ 2a"), so bigrams make a
    query that shares a term with a chunk score clearly higher than one that only
    shares single syllables. A dev double for offline RAG, not a semantic model.
    """

    model_id = "fake-hash-768"

    def _vector(self, text: str) -> list[float]:
        vec = [0.0] * self.dimension
        toks = _tokens(text)
        feats = [(t, 1.0) for t in toks] + [
            (f"{a} {b}", 1.5) for a, b in zip(toks, toks[1:], strict=False)
        ]
        for feat, weight in feats:
            h = hashlib.blake2b(feat.encode("utf-8"), digest_size=8).digest()
            idx = int.from_bytes(h[:4], "big") % self.dimension
            sign = 1.0 if h[4] & 1 else -1.0
            vec[idx] += sign * weight
        return l2_normalize(vec)

    def embed(self, texts: list[str], kind: EmbedKind = "document") -> list[list[float]]:
        return [self._vector(t) for t in texts]


class GeminiEmbeddingProvider(EmbeddingProvider):
    """Gemini embeddings via google-genai (optional extra `llm`), truncated to 768
    dimensions with `output_dimensionality` and re-normalised (truncated Gemini
    vectors are not unit length)."""

    _BATCH = 50

    def __init__(self, api_key: str, model: str, timeout_s: float = 60.0) -> None:
        self._api_key = api_key
        self._timeout_s = timeout_s
        self.model_id = model

    def embed(self, texts: list[str], kind: EmbedKind = "document") -> list[list[float]]:
        from google import genai
        from google.genai import types

        from avp_api.providers.llm import gemini_http_options

        client = genai.Client(
            api_key=self._api_key, http_options=gemini_http_options(self._timeout_s)
        )
        config = types.EmbedContentConfig(
            output_dimensionality=self.dimension,
            task_type="RETRIEVAL_QUERY" if kind == "query" else "RETRIEVAL_DOCUMENT",
        )
        out: list[list[float]] = []
        for i in range(0, len(texts), self._BATCH):
            resp = client.models.embed_content(
                model=self.model_id, contents=texts[i : i + self._BATCH], config=config
            )
            for emb in resp.embeddings or []:
                values = list(emb.values or [])
                if len(values) != self.dimension:
                    raise ValueError(f"embedding has {len(values)} dims, expected {self.dimension}")
                out.append(l2_normalize(values))
        if len(out) != len(texts):
            raise ValueError("embedding count mismatch")
        return out


def get_embedding_provider() -> EmbeddingProvider:
    s = get_settings()
    if s.llm_provider == "gemini" and s.llm_api_key and s.embedding_model:
        return GeminiEmbeddingProvider(s.llm_api_key, s.embedding_model, s.llm_timeout_s)
    return FakeEmbeddingProvider()


# Debrief retrieval embeds one deterministic query per focused criterion (built
# from the versioned rubric), so the same few queries recur on every debrief.
# Cache them in-process by (provider type, model, dimension, text) (AVP-167).
QueryKey = tuple[str, str, int, str]
_query_cache: BoundedLRU[QueryKey, tuple[float, ...]] = BoundedLRU(512)


def query_cache() -> BoundedLRU[QueryKey, tuple[float, ...]]:
    """The process-wide query-embedding cache (exposed for tests and stats)."""
    return _query_cache


def embed_queries(embedder: EmbeddingProvider, texts: list[str]) -> list[list[float]]:
    """`embedder.embed(texts, kind="query")` with an LRU in front: only texts not
    seen before reach the provider, in one batched call. Order is preserved."""
    keys = [(type(embedder).__name__, embedder.model_id, embedder.dimension, t) for t in texts]
    found = [_query_cache.get(k) for k in keys]
    missing = list(dict.fromkeys(t for t, v in zip(texts, found, strict=True) if v is None))
    if missing:
        fresh = embedder.embed(missing, kind="query")
        if len(fresh) != len(missing):
            raise ValueError("embedding count mismatch")
        by_text = dict(zip(missing, fresh, strict=True))
        for i, (k, t) in enumerate(zip(keys, texts, strict=True)):
            if found[i] is None:
                vec = tuple(by_text[t])
                _query_cache.put(k, vec)
                found[i] = vec
    return [list(v) for v in found if v is not None]
