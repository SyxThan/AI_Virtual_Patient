"""Practice-report PDF tests (Slice 9, AVP-105; ADR-0010). Reuses the Slice 8
in-memory harness; synthetic transcripts only."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from avp_api.schemas.debrief import DebriefClaimItem, DebriefResponse, PedagogicalSummary
from avp_api.schemas.evaluation import CriterionResultResponse, EvaluationResponse
from avp_api.schemas.session import SessionResponse
from avp_api.services import pdf_service
from avp_api.services.pdf_service import (
    TITLE,
    ascii_fold,
    build_report,
    find_forbidden_wording,
    find_unicode_font,
    render_pdf,
    sanitize,
)
from tests.test_debrief_api import DebriefHarness, _interview
from tests.test_evaluation_api import CASE


def _finished(h: DebriefHarness) -> tuple[str, dict]:
    sid, auth = _interview(h)
    assert h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth).status_code == 200
    return sid, auth


def test_pdf_download_200_pdf_bytes() -> None:
    h = DebriefHarness()
    sid, auth = _finished(h)
    r = h.client.get(f"/api/v1/sessions/{sid}/debrief/pdf", headers=auth)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF-") and len(r.content) > 2000
    disp = r.headers["content-disposition"]
    assert disp == f'attachment; filename="avp-practice-report-{sid[:8]}.pdf"'
    assert r.headers["cache-control"] == "no-store"


def test_pdf_wrong_token_404_and_active_409() -> None:
    h = DebriefHarness()
    sid, auth = h.new_session()
    url = f"/api/v1/sessions/{sid}/debrief/pdf"
    assert h.client.get(url, headers=auth).status_code == 409  # not finished yet
    h.client.post(f"/api/v1/sessions/{sid}/finish", headers=auth)
    assert h.client.get(url, headers={"X-Guest-Token": "not-the-token"}).status_code == 404
    assert h.client.get(url).status_code == 404


def test_pdf_202_while_evaluation_or_debrief_pending() -> None:
    h = DebriefHarness(run_jobs=False)
    sid, auth = _finished(h)
    url = f"/api/v1/sessions/{sid}/debrief/pdf"
    r = h.client.get(url, headers=auth)
    assert r.status_code == 202 and r.json()["status"] == "pending"
    h.chain = False
    h.run_job(h.store.jobs[0].id)  # evaluation done, debrief still queued
    assert h.client.get(url, headers=auth).status_code == 202
    h.run_job(h.store.jobs[1].id)
    assert h.client.get(url, headers=auth).status_code == 200


def _report_inputs(feedback: str = "Hỏi rõ thời gian sốt.") -> tuple:
    now = datetime.now(UTC)
    sess = SessionResponse(id="3f2c1d0e-aaaa-bbbb-cccc-000000000000", case_id="case-01-hfmd",
                           case_version=1, mode="guided", role="student", status="evaluated",
                           created_at=now, guest_token="SECRET-GUEST-TOKEN")  # fmt: skip
    crit = CriterionResultResponse(
        criterion_id="r-startle-hx", criterion="Hỏi giật mình", domain="history", weight=3,
        critical=True, level=0, status="unmet", score=0.0, evidence=[], feedback=feedback,
        flagged=False, low_reliability=False,
    )  # fmt: skip
    ev = EvaluationResponse(status="done", session_id=sess.id, evaluation_id="e1",
                            rubric_version=1, scoring_version="1.0.0", model="fake-heuristic",
                            prompt_version="evaluator-v1", total_score=35.71,
                            critical_missed=True, criteria=[crit], created_at=now)  # fmt: skip
    db = DebriefResponse(
        status="done", session_id=sess.id, id="d1", evaluation_id="e1",
        summary=PedagogicalSummary(expected_approach="Hỏi bệnh → khám → phân độ",
                                   rationale="Giật mình là dấu hiệu cảnh báo.",
                                   learning_points=["Phân biệt độ 2a và 2b"],
                                   acceptable_alternatives="Chưa ghi nhận.",
                                   important_errors=["Bỏ sót giật mình"]),
        items=[DebriefClaimItem(text="Chưa hỏi giật mình.", verified=False)],
    )  # fmt: skip
    return sess, ev, db


def test_report_text_follows_adr_0010_and_keeps_secrets_out_of_qr() -> None:
    sess, ev, db = _report_inputs()
    report = build_report(sess, ev, db, CASE, "https://avp.example.org/")
    text = report.all_text()
    assert report.title == TITLE == "BÁO CÁO PHẢN HỒI THỰC HÀNH LÂM SÀNG"
    assert find_forbidden_wording(text) == []
    assert "không phải kết quả đánh giá chính thức hay chứng chỉ" in report.disclaimer
    assert report.red_flag and "CẢNH BÁO" in report.red_flag  # critical_missed=True
    assert report.draft_note  # case and corpus are drafts
    assert report.qr_url == f"https://avp.example.org/debrief/{sess.id}"
    assert "SECRET-GUEST-TOKEN" not in text
    assert "35.71 / 100" in text and "Chưa đối chiếu được nguồn trích dẫn" in text


@pytest.mark.parametrize(
    "bad",
    ["Đây là chứng chỉ năng lực.", "Certified by AVP", "Giấy chứng nhận hoàn thành", "CERTIFICATE"],
)
def test_certificate_wording_in_llm_text_is_replaced(bad: str) -> None:
    assert find_forbidden_wording(bad)
    assert find_forbidden_wording(sanitize(bad)) == []
    sess, ev, db = _report_inputs(feedback=bad)
    assert find_forbidden_wording(build_report(sess, ev, db, CASE, "http://x").all_text()) == []


def test_negated_disclaimer_is_the_only_allowed_mention() -> None:
    assert find_forbidden_wording("Học liệu luyện tập, không phải chứng chỉ.") == []
    assert find_forbidden_wording("không phải chứng chỉ. Đây là chứng chỉ.") == ["chứng chỉ"]


def test_guard_refuses_to_print_certificate_title(monkeypatch) -> None:
    sess, ev, db = _report_inputs()
    monkeypatch.setattr(pdf_service, "TITLE", "CHỨNG CHỈ THỰC HÀNH")
    with pytest.raises(ValueError, match="ADR-0010"):
        pdf_service.generate_debrief_pdf(sess, ev, db, CASE, "http://x")


def test_vietnamese_renders_with_unicode_font_and_with_ascii_fallback() -> None:
    sess, ev, db = _report_inputs()
    report = build_report(sess, ev, db, CASE, "http://localhost:3000")
    assert render_pdf(report, font=None).startswith(b"%PDF-")  # headless, no TTF at all
    font = find_unicode_font()
    if font is not None:  # Windows / Ubuntu runners ship one; minimal images may not
        assert render_pdf(report, font=font).startswith(b"%PDF-")
    assert ascii_fold("Đạt một phần — đủ ≥ 2") == "Dat mot phan - du >= 2"
