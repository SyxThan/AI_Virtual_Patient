"""Practice-report PDF + QR (Slice 9, AVP-105; ADR-0010).

Two steps so the wording can be tested without parsing a PDF:
1. `build_report(...)` turns session/evaluation/debrief into plain text sections
   (every string that will be printed);
2. `render_pdf(report)` lays them out with fpdf2 and embeds the QR code.

ADR-0010: this is practice feedback. The title is "BÁO CÁO PHẢN HỒI THỰC HÀNH LÂM
SÀNG"; certificate wording is never printed. The only allowed mention is the
negated disclaimer ("không phải ... chứng chỉ"); any other occurrence in dynamic
text (LLM feedback) is replaced before rendering.

Fonts: Vietnamese needs a Unicode TTF. We look for a system font (Windows Arial /
Segoe UI, Linux DejaVu / Liberation / Noto). If none exists (minimal CI image),
text is folded to ASCII (diacritics stripped, đ -> d) so rendering never fails.
The QR encodes only the public page URL `{web_base_url}/debrief/{session_id}`;
no token or secret is ever put into it.
"""

from __future__ import annotations

import io
import os
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import qrcode
from fpdf import FPDF

from avp_api.schemas.debrief import DebriefResponse
from avp_api.schemas.evaluation import PRACTICE_NOTICE, EvaluationResponse
from avp_api.schemas.session import SessionResponse

TITLE = "BÁO CÁO PHẢN HỒI THỰC HÀNH LÂM SÀNG"
QR_CAPTION = "Quét mã QR để xem lại transcript và bằng chứng trực tuyến (cần quyền truy cập phiên)."
RED_FLAG = (
    "CẢNH BÁO DẤU HIỆU NGUY HIỂM: bỏ sót hoặc chưa đạt tiêu chí trọng yếu "
    "(giật mình / phân độ Tay - Chân - Miệng)."
)
DRAFT_NOTE = "Ca bệnh và tài liệu nguồn đang ở bản nháp, chưa được bác sĩ thẩm định."

STATUS_VI = {
    "met": "Đạt",
    "partial": "Đạt một phần",
    "unmet": "Chưa đạt",
    "insufficient_evidence": "Thiếu bằng chứng",
}
MODE_VI = {"guided": "Luyện tập (guided)", "exam": "Thi thử (exam)"}

# --- ADR-0010 wording guard -----------------------------------------------------

_FORBIDDEN = re.compile(r"certif\w*|chứng\s+chỉ|chứng\s+nhận", re.IGNORECASE)
# The disclaimer itself negates the word; that is the only allowed use.
_NEGATED = re.compile(r"không\s+phải[^.;\n]{0,80}?chứng\s+chỉ", re.IGNORECASE)


def find_forbidden_wording(text: str) -> list[str]:
    norm = unicodedata.normalize("NFC", text)
    return _FORBIDDEN.findall(_NEGATED.sub("", norm))


def sanitize(text: str) -> str:
    """Dynamic text (LLM feedback) must not claim to be a certificate."""
    norm = unicodedata.normalize("NFC", text or "")
    if not find_forbidden_wording(norm):
        return norm
    return _FORBIDDEN.sub("phản hồi luyện tập", norm)


# --- fonts -----------------------------------------------------------------------

_FONT_CANDIDATES: list[tuple[str, str]] = [
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
    ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/segoeuib.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
     "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    ("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
     "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"),
    ("/Library/Fonts/Arial Unicode.ttf", "/Library/Fonts/Arial Unicode.ttf"),
]  # fmt: skip


def find_unicode_font() -> tuple[str, str] | None:
    """(regular, bold) TTF paths, or None. PDF_FONT_PATH overrides (regular = bold)."""
    override = os.environ.get("PDF_FONT_PATH")
    if override and Path(override).is_file():
        return override, override
    for regular, bold in _FONT_CANDIDATES:
        if Path(regular).is_file():
            return regular, bold if Path(bold).is_file() else regular
    return None


_ASCII_MAP = str.maketrans(
    {"đ": "d", "Đ": "D", "—": "-", "–": "-", "…": "...", "·": "-", "•": "-",
     "“": '"', "”": '"', "‘": "'", "’": "'", "≥": ">=", "≤": "<="}
)  # fmt: skip


def ascii_fold(text: str) -> str:
    text = text.translate(_ASCII_MAP)
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.encode("ascii", "replace").decode("ascii")


# --- report model ------------------------------------------------------------------


@dataclass
class Section:
    heading: str
    lines: list[str] = field(default_factory=list)


@dataclass
class CriterionRow:
    criterion: str
    status: str
    weight: str
    note: str
    critical: bool


@dataclass
class Report:
    title: str
    info: list[tuple[str, str]]
    red_flag: str | None
    draft_note: str | None
    rows: list[CriterionRow]
    sections: list[Section]
    qr_url: str
    qr_caption: str
    disclaimer: str

    def all_text(self) -> str:
        parts = [self.title, *(f"{k} {v}" for k, v in self.info), self.red_flag or "",
                 self.draft_note or "", self.qr_caption, self.disclaimer]  # fmt: skip
        for r in self.rows:
            parts += [r.criterion, r.status, r.weight, r.note]
        for s in self.sections:
            parts += [s.heading, *s.lines]
        return "\n".join(parts)


def qr_target(web_base_url: str, session_id: str) -> str:
    return f"{web_base_url.rstrip('/')}/debrief/{session_id}"


def _case_title(case: dict, fallback: str) -> str:
    title = case.get("title")
    if isinstance(title, dict):
        title = title.get("vi") or title.get("en")
    specialty = case.get("specialty")
    base = str(title or fallback)
    return f"{base} ({specialty})" if specialty else base


def build_report(
    session: SessionResponse,
    evaluation: EvaluationResponse,
    debrief: DebriefResponse,
    case: dict,
    web_base_url: str,
    student_name: str | None = None,
) -> Report:
    date = (evaluation.created_at or session.created_at).strftime("%d/%m/%Y")
    score = "—" if evaluation.total_score is None else f"{evaluation.total_score:g} / 100"
    info = [
        ("Mã phiên:", session.id),
        # Profile display name only (never the email); omitted for guests (AVP-108).
        *([("Học viên:", sanitize(student_name))] if student_name else []),
        ("Ca bệnh:", sanitize(_case_title(case, session.case_id))),
        ("Chế độ:", MODE_VI.get(session.mode, session.mode)),
        ("Ngày thực hiện:", date),
        ("Điểm Auto-OSCE:", score),
        ("Phiên bản chấm:", f"rubric v{evaluation.rubric_version} · scoring "
                            f"{evaluation.scoring_version} · {evaluation.model}"),
    ]  # fmt: skip
    rows = [
        CriterionRow(
            criterion=sanitize(c.criterion),
            status=STATUS_VI.get(c.status, c.status),
            weight=f"{c.weight:g}",
            note=sanitize(c.feedback or ""),
            critical=c.critical,
        )
        for c in evaluation.criteria
    ]
    sections: list[Section] = []
    s = debrief.summary
    if s is not None:
        sections += [
            Section("1. Tiếp cận chuẩn", [sanitize(s.expected_approach)]),
            Section("2. Lý giải lâm sàng", [sanitize(s.rationale)]),
            Section("3. Điểm cần ghi nhớ", [f"• {sanitize(x)}" for x in s.learning_points]),
            Section("4. Phương án thay thế", [sanitize(s.acceptable_alternatives)]),
            Section("5. Sai sót cần tránh", [f"• {sanitize(x)}" for x in s.important_errors]),
        ]
    claims = []
    refs: dict[tuple[str, str], str] = {}
    for item in debrief.items:
        tag = "" if item.verified else " [Chưa đối chiếu được nguồn trích dẫn]"
        cites = "; ".join(f"{c.document_title} - {c.section}" for c in item.citations)
        claims.append(f"• {sanitize(item.text)}{tag}" + (f" (Nguồn: {cites})" if cites else ""))
        for c in item.citations:
            year = f", {c.year}" if c.year else ""
            refs[(c.source_id, c.section)] = f"• {c.document_title}{year} — {c.section}"
    if claims:
        sections.append(Section("Nhận xét chi tiết", claims))
    if refs:
        sections.append(Section("Tài liệu tham chiếu", sorted(refs.values())))

    draft = (case.get("review") or {}).get("status") != "clinician_reviewed"
    return Report(
        title=TITLE,
        info=info,
        red_flag=RED_FLAG if evaluation.critical_missed else None,
        draft_note=DRAFT_NOTE if draft or not debrief.sources_reviewed else None,
        rows=rows,
        sections=sections,
        qr_url=qr_target(web_base_url, session.id),
        qr_caption=QR_CAPTION,
        disclaimer=PRACTICE_NOTICE,
    )


# --- rendering ---------------------------------------------------------------------


def qr_png(url: str) -> bytes:
    img = qrcode.make(url, box_size=6, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class _ReportPDF(FPDF):
    def __init__(self, family: str, fold: bool, disclaimer: str) -> None:
        super().__init__(format="A4")
        self.family, self.fold, self.disclaimer = family, fold, disclaimer

    def t(self, text: str) -> str:
        return ascii_fold(text) if self.fold else text

    def footer(self) -> None:
        self.set_y(-14)
        self.set_font(self.family, "", 8)
        self.set_text_color(90, 90, 90)
        self.multi_cell(0, 4, self.t(f"{self.disclaimer}   Trang {self.page_no()}"), align="C")
        self.set_text_color(0, 0, 0)


_AUTO = "auto"


def render_pdf(report: Report, font: tuple[str, str] | None | str = _AUTO) -> bytes:
    """`font`: "auto" (system lookup), a (regular, bold) TTF pair, or None to force
    the ASCII-folded core-font fallback."""
    if font == _AUTO:
        font = find_unicode_font()
    assert font is None or isinstance(font, tuple)
    if font is not None:
        family, fold = "AVPSans", False
    else:
        family, fold = "Helvetica", True
    pdf = _ReportPDF(family, fold, report.disclaimer)
    if font is not None:
        pdf.add_font(family, "", font[0])
        pdf.add_font(family, "B", font[1])
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_title(pdf.t(report.title))
    pdf.add_page()
    t = pdf.t

    def para(text: str, size: float = 10, style: str = "", h: float = 5) -> None:
        pdf.set_font(family, style, size)
        pdf.multi_cell(0, h, t(text), new_x="LMARGIN", new_y="NEXT")

    pdf.set_font(family, "B", 15)
    pdf.multi_cell(0, 8, t(report.title), align="C", new_x="LMARGIN", new_y="NEXT")
    para(report.disclaimer, size=9, h=4.5)
    pdf.ln(2)
    # QR block, top right of page 1, beside the session info (no secrets in it).
    qr_w, qr_x, info_top = 34, pdf.w - pdf.r_margin - 34, pdf.get_y()
    pdf.image(io.BytesIO(qr_png(report.qr_url)), x=qr_x, y=info_top, w=qr_w, h=qr_w)
    pdf.set_xy(qr_x - 4, info_top + qr_w + 1)
    pdf.set_font(family, "", 7)
    pdf.multi_cell(qr_w + 8, 3.2, t(report.qr_caption), align="C")
    qr_bottom = pdf.get_y()
    pdf.set_xy(pdf.l_margin, info_top)
    value_w = qr_x - pdf.l_margin - 38 - 4
    for key, value in report.info:
        pdf.set_font(family, "B", 10)
        pdf.cell(38, 6, t(key))
        pdf.set_font(family, "", 10)
        pdf.multi_cell(value_w, 6, t(value), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(family, "", 7)
    pdf.multi_cell(value_w + 38, 4, t(report.qr_url), new_x="LMARGIN", new_y="NEXT")
    pdf.set_y(max(pdf.get_y(), qr_bottom))
    if report.draft_note:
        pdf.set_text_color(120, 80, 0)
        para(report.draft_note, size=9)
        pdf.set_text_color(0, 0, 0)

    if report.red_flag:
        pdf.ln(2)
        pdf.set_fill_color(253, 226, 226)
        pdf.set_draw_color(200, 30, 30)
        pdf.set_text_color(160, 20, 20)
        pdf.set_font(family, "B", 10)
        pdf.multi_cell(0, 6, t(report.red_flag), border=1, fill=True,
                       new_x="LMARGIN", new_y="NEXT")  # fmt: skip
        pdf.set_text_color(0, 0, 0)
        pdf.set_draw_color(0, 0, 0)
        pdf.set_fill_color(255, 255, 255)

    pdf.ln(3)
    para("Bảng điểm theo tiêu chí OSCE", size=12, style="B", h=7)
    pdf.set_font(family, "", 9)
    with pdf.table(col_widths=(56, 24, 16, 94), text_align="LEFT", line_height=4.6) as table:
        header = table.row()
        for h in ("Tiêu chí", "Trạng thái", "Trọng số", "Nhận xét"):
            header.cell(t(h))
        for r in report.rows:
            row = table.row()
            row.cell(t(r.criterion + (" (trọng yếu)" if r.critical else "")))
            row.cell(t(r.status))
            row.cell(t(r.weight))
            row.cell(t(r.note))

    for sec in report.sections:
        pdf.ln(2)
        para(sec.heading, size=11, style="B", h=6)
        for line in sec.lines:
            para(line, size=9.5)

    return bytes(pdf.output())


def generate_debrief_pdf(
    session: SessionResponse,
    evaluation: EvaluationResponse,
    debrief: DebriefResponse,
    case: dict,
    web_base_url: str,
    student_name: str | None = None,
) -> bytes:
    report = build_report(session, evaluation, debrief, case, web_base_url, student_name)
    leftover = find_forbidden_wording(report.all_text())
    if leftover:  # fixed strings changed by someone: fail loudly, never print it
        raise ValueError(f"ADR-0010 wording in report: {leftover}")
    return render_pdf(report)
