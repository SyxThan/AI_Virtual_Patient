#!/usr/bin/env python
"""Ingest data/guidelines/*.json into source_documents/source_chunks (AVP-018).

Idempotent: each document is upserted by `source_key`; an unchanged document
(same text, metadata and embedding model) is skipped without re-embedding. A
document without `rights_checked: true` is refused (T-RAG-03) and the script
exits 1 so CI notices. Embeddings come from `get_embedding_provider()` (Fake
offline, Gemini when LLM_PROVIDER=gemini + key + EMBEDDING_MODEL are set).

Usage: python scripts/ingest_guidelines.py [path/to/corpus.json]
Run `make db-migrate` first (needs revision 0002).
"""

from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy.orm import Session

from avp_api.config import get_settings
from avp_api.db.repositories.rag_repo import SqlRagRepository
from avp_api.db.session import get_engine
from avp_api.providers.embeddings import get_embedding_provider
from avp_api.services.rag_corpus import DEFAULT_CORPUS, ingest_corpus, load_corpus


def main(argv: list[str]) -> int:
    if not get_settings().database_url:
        print("DATABASE_URL is not set; configure .env (see .env.example)", file=sys.stderr)
        return 2
    path = Path(argv[1]) if len(argv) > 1 else DEFAULT_CORPUS
    embedder = get_embedding_provider()
    print(f"corpus: {path.name} | embedding model: {embedder.model_id}")
    with Session(get_engine()) as db:
        results = ingest_corpus(SqlRagRepository(db), embedder, load_corpus(path))
    for key, outcome in results.items():
        print(f"  {key}: {outcome}")
    return 1 if any(v.startswith("refused") for v in results.values()) else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
