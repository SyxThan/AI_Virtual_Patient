"""Guideline corpus loading + ingest (Slice 8, AVP-017/018). Shared by
`scripts/ingest_guidelines.py` and the tests, so both go through the same rights
gate. Cold path / offline tooling only."""

from __future__ import annotations

import json
from pathlib import Path

from avp_api.db.repositories.rag_repo import ChunkIn, DocumentIn, RagRepository, check_rights
from avp_api.providers.embeddings import EmbeddingProvider

REPO_ROOT = Path(__file__).resolve().parents[4]
GUIDELINES_DIR = REPO_ROOT / "data" / "guidelines"
DEFAULT_CORPUS = GUIDELINES_DIR / "hfmd_moh_chunks.json"

# Sentinel: take the case scope from the corpus file (AVP-151).
FROM_FILE = "__from_file__"


def load_corpus(path: Path = DEFAULT_CORPUS, case_id: str | None = FROM_FILE) -> list[DocumentIn]:
    """Case scope (AVP-151): a document's `case_id` key wins, else the file's
    top-level `case_id`, else None (shared by every case). Passing `case_id`
    (a case id, or None for shared) overrides both."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    file_case = raw.get("case_id")
    docs = []
    for d in raw["documents"]:
        scope = d.get("case_id", file_case) if case_id == FROM_FILE else case_id
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
                case_id=scope,
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
