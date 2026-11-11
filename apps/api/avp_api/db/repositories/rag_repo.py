"""RAG corpus data access (Slice 8, AVP-017/018; ADR-0005 pgvector).

Rights gate (T-RAG-03): `ingest_document` refuses any document whose
`rights_checked` is not True, before anything is written. Retrieval also joins
`source_documents` and keeps only rights-checked documents, so a row that got in
some other way is never cited.

Cold path only: nothing in the patient hot path imports this module (ADR-0002).
"""

from __future__ import annotations

import hashlib
import json
import math
import uuid
from dataclasses import dataclass, field
from typing import Protocol

from sqlalchemy import delete, select
from sqlalchemy.orm import Session as OrmSession

from avp_api.db import models

RIGHTS_ERROR = "Cannot ingest document without rights_checked=True"


@dataclass(frozen=True)
class ChunkIn:
    section: str
    text: str


@dataclass
class DocumentIn:
    source_key: str
    title: str
    publisher: str | None
    year: int | None
    license_note: str | None
    rights_checked: bool
    review_status: str = "draft"
    chunks: list[ChunkIn] = field(default_factory=list)


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: str
    source_key: str
    document_title: str
    publisher: str | None
    year: int | None
    section: str
    text: str
    review_status: str
    score: float  # cosine similarity, 1 = identical direction


class RagRepository(Protocol):
    def ingest_document(
        self, doc: DocumentIn, embeddings: list[list[float]], embedding_model: str
    ) -> str: ...

    def search_chunks(
        self, query_embedding: list[float], embedding_model: str, top_k: int = 5
    ) -> list[RetrievedChunk]: ...


def check_rights(doc: DocumentIn) -> None:
    if doc.rights_checked is not True:
        raise ValueError(RIGHTS_ERROR)


def document_hash(doc: DocumentIn, embedding_model: str) -> str:
    payload = {
        "doc": [doc.source_key, doc.title, doc.publisher, doc.year, doc.license_note],
        "review_status": doc.review_status,
        "chunks": [[c.section, c.text] for c in doc.chunks],
        "embedding_model": embedding_model,
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _validate(doc: DocumentIn, embeddings: list[list[float]]) -> None:
    check_rights(doc)
    if len(embeddings) != len(doc.chunks):
        raise ValueError("one embedding per chunk is required")


def cosine(a: list[float], b: list[float]) -> float:
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return sum(x * y for x, y in zip(a, b, strict=True)) / (na * nb)


class SqlRagRepository:
    def __init__(self, db: OrmSession) -> None:
        self.db = db

    def ingest_document(
        self, doc: DocumentIn, embeddings: list[list[float]], embedding_model: str
    ) -> str:
        """Upsert by source_key in one transaction. Returns "unchanged",
        "inserted" or "updated"; an updated document gets all-new chunks."""
        _validate(doc, embeddings)
        digest = document_hash(doc, embedding_model)
        try:
            row = self.db.execute(
                select(models.SourceDocument).where(
                    models.SourceDocument.source_key == doc.source_key
                )
            ).scalar_one_or_none()
            if row is not None and row.content_hash == digest:
                self.db.rollback()
                return "unchanged"
            outcome = "updated" if row is not None else "inserted"
            if row is None:
                row = models.SourceDocument(source_key=doc.source_key)
                self.db.add(row)
            row.title, row.publisher, row.year = doc.title, doc.publisher, doc.year
            row.license_note, row.rights_checked = doc.license_note, True
            row.review_status, row.content_hash = doc.review_status, digest
            self.db.flush()
            self.db.execute(
                delete(models.SourceChunk).where(models.SourceChunk.document_id == row.id)
            )
            for i, (chunk, vec) in enumerate(zip(doc.chunks, embeddings, strict=True)):
                self.db.add(
                    models.SourceChunk(
                        document_id=row.id,
                        section=chunk.section,
                        chunk_index=i,
                        text=chunk.text,
                        embedding=vec,
                        embedding_model=embedding_model,
                    )
                )
            self.db.commit()
            return outcome
        except Exception:
            self.db.rollback()
            raise

    def search_chunks(
        self, query_embedding: list[float], embedding_model: str, top_k: int = 5
    ) -> list[RetrievedChunk]:
        dist = models.SourceChunk.embedding.cosine_distance(query_embedding).label("dist")
        rows = self.db.execute(
            select(models.SourceChunk, models.SourceDocument, dist)
            .join(models.SourceDocument, models.SourceChunk.document_id == models.SourceDocument.id)
            .where(
                models.SourceDocument.rights_checked.is_(True),
                models.SourceChunk.embedding_model == embedding_model,
                models.SourceChunk.embedding.is_not(None),
            )
            .order_by(dist)
            .limit(top_k)
        ).all()
        return [
            RetrievedChunk(
                chunk_id=str(chunk.id),
                source_key=doc.source_key or str(doc.id),
                document_title=doc.title,
                publisher=doc.publisher,
                year=doc.year,
                section=chunk.section or "",
                text=chunk.text,
                review_status=doc.review_status,
                score=1.0 - float(d),
            )
            for chunk, doc, d in rows
        ]


class InMemoryRagRepository:
    """Same contract as SqlRagRepository, pure Python (unit tests, dev)."""

    def __init__(self) -> None:
        self.docs: dict[str, tuple[DocumentIn, str]] = {}  # source_key -> (doc, hash)
        self.chunks: list[tuple[RetrievedChunk, list[float], str]] = []  # chunk, vec, model

    def ingest_document(
        self, doc: DocumentIn, embeddings: list[list[float]], embedding_model: str
    ) -> str:
        _validate(doc, embeddings)
        digest = document_hash(doc, embedding_model)
        prev = self.docs.get(doc.source_key)
        if prev is not None and prev[1] == digest:
            return "unchanged"
        self.chunks = [c for c in self.chunks if c[0].source_key != doc.source_key]
        self.docs[doc.source_key] = (doc, digest)
        for chunk, vec in zip(doc.chunks, embeddings, strict=True):
            meta = RetrievedChunk(
                chunk_id=str(uuid.uuid4()),
                source_key=doc.source_key,
                document_title=doc.title,
                publisher=doc.publisher,
                year=doc.year,
                section=chunk.section,
                text=chunk.text,
                review_status=doc.review_status,
                score=0.0,
            )
            self.chunks.append((meta, vec, embedding_model))
        return "updated" if prev is not None else "inserted"

    def search_chunks(
        self, query_embedding: list[float], embedding_model: str, top_k: int = 5
    ) -> list[RetrievedChunk]:
        scored = [
            (cosine(query_embedding, vec), meta)
            for meta, vec, model in self.chunks
            if model == embedding_model and self.docs[meta.source_key][0].rights_checked
        ]
        scored.sort(key=lambda x: x[0], reverse=True)
        return [_with_score(meta, s) for s, meta in scored[:top_k]]


def _with_score(meta: RetrievedChunk, score: float) -> RetrievedChunk:
    return RetrievedChunk(**{**meta.__dict__, "score": score})
