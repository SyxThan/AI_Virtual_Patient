---
name: rag-citation
description: Use when building or changing document ingest, chunking, embeddings, retrieval, or citation formatting for the Debriefing agent (cold path only).
---

# RAG and citations

Authoritative spec: `docs/specs/evaluation.md` (debrief) and `docs/specs/database.md`.
RAG runs **only on the cold path** (debrief), never during the interview (ADR-0002).

## Store (ADR-0005)
- Embeddings live in **PostgreSQL + pgvector**, queried from FastAPI. No separate vector DB. A vector index is added with the ingest migration (AVP-018).
- The embedding model is fixed in AVP-018; **changing it means re-embedding everything** — treat as a migration, not a config tweak. Read the model id from env (`EMBEDDING_MODEL`).

## Rights first (AVP-017; R-04)
- Only ingest sources whose terms allow it. Each source carries metadata (source id, version, section/page) and a `rights_checked` status. A document with unverified rights is **not** ingested into a release corpus (T-RAG-03). Sources: BV Bệnh Nhiệt đới TP.HCM 2023 guideline and MOH decisions — third-party, record in the IP section.

## Pipeline
- Ingest → chunk (keep section/page metadata per chunk) → embed → store. Retrieval returns chunks with their source metadata so a citation can be built.

## Citations (the hard rule)
- Every debrief claim is **cited** (`source_id` + section/page) **or explicitly marked unverified** — never an invented citation (T-RAG-02). A citation must resolve to a real source and section (T-RAG-01). Citation payload shape is in `docs/specs/openapi.yaml` (`Debrief.items[].citations`).

## Pitfalls
- No RAG on the patient hot path. Don't fabricate a citation to fill a gap — mark it unverified. Don't silently swap the embedding model.
