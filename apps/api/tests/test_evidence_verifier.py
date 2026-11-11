"""Evidence verifier tests (T-OSCE-01/02/05). Synthetic transcripts only."""

from __future__ import annotations

import unicodedata
from datetime import UTC, datetime

from avp_api.db.repositories.turn_repo import TurnRecord
from avp_api.schemas.evaluation import EvidenceItem, ProposedCriterion
from avp_api.services.evidence_verifier import normalize_text, verify_criterion_evidence


def _t(idx: int, speaker: str, text: str) -> TurnRecord:
    return TurnRecord(
        id=idx + 1,
        session_id="s",
        idx=idx,
        speaker=speaker,
        text=text,
        t_start_ms=0,
        created_at=datetime.now(UTC),
    )


TURNS = {
    0: _t(0, "student", "Chào chị, cháu sốt mấy ngày rồi ạ?"),
    1: _t(1, "patient", "Dạ cháu sốt hai ngày nay, hay giật mình lắm."),
    2: _t(2, "student", "Cháu có hay giật mình không chị?"),
    3: _t(3, "system", "Không có ghi nhận trong hồ sơ cho vùng này."),
}


def _p(level, evidence) -> ProposedCriterion:
    return ProposedCriterion(
        criterion_id="r-x",
        level=level,
        evidence=[EvidenceItem(turn_idx=i, quote=q) for i, q in evidence],
        feedback="ok",
    )


def test_t_osce_01_verbatim_student_quote_keeps_met_and_partial():
    met = verify_criterion_evidence(_p(2, [(2, "Cháu có hay giật mình không chị?")]), TURNS)
    assert (met.status, met.level, met.flagged) == ("met", 2, False)
    assert met.evidence[0].turn_idx == 2
    part = verify_criterion_evidence(_p(1, [(0, "sốt mấy ngày")]), TURNS)
    assert (part.status, part.level, part.flagged) == ("partial", 1, False)


def test_t_osce_02_met_or_partial_without_evidence_is_downgraded():
    for level in (1, 2):
        v = verify_criterion_evidence(_p(level, []), TURNS)
        assert (v.status, v.level, v.flagged, v.evidence) == (
            "insufficient_evidence",
            None,
            True,
            [],
        )


def test_t_osce_05_fabricated_or_wrong_speaker_quotes_are_rejected():
    cases = [
        [(2, "Cháu có co giật không?")],  # not said
        [(1, "hay giật mình lắm")],  # patient's words
        [(3, "Không có ghi nhận")],  # system turn
        [(99, "Cháu có hay giật mình")],  # no such turn
        [(2, "   ")],  # empty quote
    ]
    for ev in cases:
        v = verify_criterion_evidence(_p(2, ev), TURNS)
        assert v.status == "insufficient_evidence" and v.level is None and v.flagged


def test_mixed_evidence_keeps_only_verified_quotes():
    v = verify_criterion_evidence(
        _p(2, [(1, "giật mình"), (2, "hay giật mình"), (2, "hay giật mình")]), TURNS
    )
    assert v.status == "met"
    assert [(e.turn_idx, e.quote) for e in v.evidence] == [(2, "hay giật mình")]


def test_unmet_and_null_levels():
    unmet = verify_criterion_evidence(_p(0, [(1, "giật mình")]), TURNS)
    assert (unmet.status, unmet.level, unmet.flagged, unmet.evidence) == ("unmet", 0, False, [])
    none = verify_criterion_evidence(_p(None, []), TURNS)
    assert (none.status, none.level, none.flagged) == ("insufficient_evidence", None, False)


def test_normalization_whitespace_case_and_nfd():
    assert normalize_text("  Cháu   SỐT\n mấy\tngày ") == "cháu sốt mấy ngày"
    nfd = unicodedata.normalize("NFD", "giật mình")
    assert nfd != "giật mình"
    assert normalize_text(nfd) == normalize_text("GIẬT  MÌNH")
    v = verify_criterion_evidence(
        _p(2, [(2, unicodedata.normalize("NFD", "HAY  GIẬT MÌNH"))]), TURNS
    )
    assert v.status == "met"
