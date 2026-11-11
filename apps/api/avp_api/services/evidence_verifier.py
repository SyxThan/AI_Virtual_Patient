"""Deterministic evidence verifier (Slice 7, AVP-013; CLAUDE.md Hard Rule 4).

The LLM proposes a level and quotes; this code decides which quotes are real.
A quote counts only if its turn exists, was spoken by the student, and the quote
is a substring of that turn after NFC normalisation, whitespace collapsing and
case folding. met/partial without a surviving quote is downgraded to
insufficient_evidence and flagged (mirrors the evaluation_items CHECKs).
"""

from __future__ import annotations

import unicodedata
from collections.abc import Mapping

from avp_api.db.repositories.turn_repo import TurnRecord
from avp_api.schemas.evaluation import EvidenceItem, ProposedCriterion, VerifiedCriterion


def normalize_text(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text or "").split()).casefold()


def quote_is_verified(ev: EvidenceItem, turns_by_idx: Mapping[int, TurnRecord]) -> bool:
    turn = turns_by_idx.get(ev.turn_idx)
    if turn is None or turn.speaker != "student":
        return False
    quote = normalize_text(ev.quote)
    return bool(quote) and quote in normalize_text(turn.text)


def verify_criterion_evidence(
    item: ProposedCriterion, turns_by_idx: Mapping[int, TurnRecord]
) -> VerifiedCriterion:
    verified: list[EvidenceItem] = []
    seen: set[tuple[int, str]] = set()
    for ev in item.evidence:
        key = (ev.turn_idx, normalize_text(ev.quote))
        if key not in seen and quote_is_verified(ev, turns_by_idx):
            seen.add(key)
            verified.append(EvidenceItem(turn_idx=ev.turn_idx, quote=ev.quote.strip()))

    feedback = (item.feedback or "").strip()
    if item.level in (1, 2):
        if not verified:
            return VerifiedCriterion(
                criterion_id=item.criterion_id,
                level=None,
                status="insufficient_evidence",
                evidence=[],
                feedback=feedback,
                flagged=True,
            )
        status = "met" if item.level == 2 else "partial"
        return VerifiedCriterion(
            criterion_id=item.criterion_id,
            level=item.level,
            status=status,
            evidence=verified,
            feedback=feedback,
            flagged=False,
        )
    if item.level == 0:
        # Absence cannot be proven by a quote; keep only related attempts that verify.
        return VerifiedCriterion(
            criterion_id=item.criterion_id,
            level=0,
            status="unmet",
            evidence=verified,
            feedback=feedback,
            flagged=False,
        )
    return VerifiedCriterion(
        criterion_id=item.criterion_id,
        level=None,
        status="insufficient_evidence",
        evidence=verified,
        feedback=feedback,
        flagged=False,
    )


def missing_criterion(criterion_id: str) -> VerifiedCriterion:
    """A rubric criterion the LLM did not report: never credited, flagged."""
    return VerifiedCriterion(
        criterion_id=criterion_id,
        level=None,
        status="insufficient_evidence",
        evidence=[],
        feedback="",
        flagged=True,
    )
