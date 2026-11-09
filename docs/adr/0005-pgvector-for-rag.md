# ADR-0005: pgvector for RAG, no separate vector DB

- Status: Accepted
- Date: 2026-11-09
- Deciders: Team TRINITY (human), Claude Code
- Related: AVP-005; CLAUDE.md "Architecture"; docs/specs/tech-stack.md, database.md

## Context
The Debriefing Agent (cold path) retrieves source passages and cites them. This
needs vector similarity search over embedded source text. The embedding model is
fixed in AVP-018; changing it means re-embedding.

## Decision
We will store embeddings in **PostgreSQL with the `pgvector` extension** and query
them from FastAPI. No separate vector database.

## Consequences
- One datastore; retrieval joins naturally with source metadata and rights status.
- Supabase enables `vector` (AVP-034); a vector index is added with the ingest
  migration (AVP-018).
- Very large corpora may later need a dedicated store; out of scope for the MVP.

## Alternatives considered
- Pinecone / Weaviate / Qdrant: rejected — another managed service and key for a
  single-case MVP corpus.
- In-process FAISS: rejected — not shared across workers, not persistent with data.
