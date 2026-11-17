#!/usr/bin/env python
"""Ingest data/guidelines/*.json into source_documents/source_chunks (AVP-018).

Idempotent: each document is upserted by `source_key`; an unchanged document
(same text, metadata and embedding model) is skipped without re-embedding. A
document without `rights_checked: true` is refused (T-RAG-03) and the script
exits 1 so CI notices. Embeddings come from `get_embedding_provider()` (Fake
offline, Gemini when LLM_PROVIDER=gemini + key + EMBEDDING_MODEL are set).

Case scope (AVP-151): each document belongs to one case or is shared (case_id
NULL). By default the scope comes from the corpus file (`case_id` per document or
at the top level); `--case-id <id>` or `--shared` overrides it for the whole file.
With no path, every data/guidelines/*.json file is ingested.

Usage: python scripts/ingest_guidelines.py [--case-id ID | --shared] [corpus.json ...]
Run `make db-migrate` first (needs revision 0003).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy.orm import Session

from avp_api.config import get_settings
from avp_api.db.repositories.rag_repo import SqlRagRepository
from avp_api.db.session import get_engine
from avp_api.providers.embeddings import get_embedding_provider
from avp_api.services.rag_corpus import FROM_FILE, GUIDELINES_DIR, ingest_corpus, load_corpus


def _args(argv: list[str]) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Ingest guideline corpora into pgvector.")
    scope = ap.add_mutually_exclusive_group()
    scope.add_argument("--case-id", help="assign every document in the file(s) to this case")
    scope.add_argument("--shared", action="store_true", help="mark every document as shared")
    ap.add_argument("paths", nargs="*", type=Path, help="corpus JSON files (default: all)")
    return ap.parse_args(argv)


def main(argv: list[str]) -> int:
    args = _args(argv[1:])
    if not get_settings().database_url:
        print("DATABASE_URL is not set; configure .env (see .env.example)", file=sys.stderr)
        return 2
    paths = args.paths or sorted(GUIDELINES_DIR.glob("*.json"))
    case_id = None if args.shared else (args.case_id or FROM_FILE)
    embedder = get_embedding_provider()
    refused = False
    with Session(get_engine()) as db:
        repo = SqlRagRepository(db)
        for path in paths:
            docs = load_corpus(path, case_id)
            print(f"corpus: {path.name} | embedding model: {embedder.model_id}")
            for key, outcome in ingest_corpus(repo, embedder, docs).items():
                scope = next((d.case_id for d in docs if d.source_key == key), None)
                print(f"  {key} [case: {scope or 'shared'}]: {outcome}")
                refused = refused or outcome.startswith("refused")
    return 1 if refused else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
