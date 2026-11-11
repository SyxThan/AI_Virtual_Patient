"""Guideline corpus loading + ingest (Slice 8, AVP-017/018). Shared by
`scripts/ingest_guidelines.py` and the tests, so both go through the same rights
gate. Cold path / offline tooling only."""

from __future__ import annotations

import json
from pathlib import Path

from avp_api.db.repositories.rag_repo import ChunkIn, DocumentIn, RagRepository, check_rights
from avp_api.providers.embeddings import EmbeddingProvider

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_CORPUS = REPO_ROOT / "data" / "guidelines" / "hfmd_moh_chunks.json"


def load_corpus(path: Path = DEFAULT_CORPUS) -> list[DocumentIn]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    docs = []
    for d in raw["documents"]:
        docs.append(
            DocumentIn(
                source_key=d["source_key"],
                title=d["title"],
                publisher=d.get("publisher"),
                year=d.get("year"),
                license_note=d.get("license_note"),
                rights_checked=d.get("rights_checked") is True,
                review_status=d.get("review_status", "draft"),
                chunks=[ChunkIn(section=c["section"], text=c["text"]) for c in d["chunks"]],
            )
        )
    return docs


def ingest_corpus(
    repo: RagRepository, embedder: EmbeddingProvider, docs: list[DocumentIn]
) -> dict[str, str]:
    """source_key -> "inserted" | "updated" | "unchanged" | "refused: <reason>".
    A refused document is reported, never embedded or stored (T-RAG-03)."""
    out: dict[str, str] = {}
    for doc in docs:
        try:
            check_rights(doc)  # before spending an embedding call on it
        except ValueError as exc:
            out[doc.source_key] = f"refused: {exc}"
            continue
        vectors = embedder.embed([f"{c.section}\n{c.text}" for c in doc.chunks], kind="document")
        out[doc.source_key] = repo.ingest_document(doc, vectors, embedder.model_id)
    return out
