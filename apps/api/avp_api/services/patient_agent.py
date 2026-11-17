"""Patient Agent: whoever answers for the case (hot path, AVP-009, AVP-159).

The role comes from the case JSON (`patient.informant.role` + `patient`), so the
HFMD mother, a Dengue mother or an adult answering for themself each get their own
voice; the static rules are shared.

Guardrails (docs/specs/guardrails.md, Hard Rule 1):
- Tier 1: say only facts in the case JSON.
- Tier 2: non-medical persona only.
- Tier 3: unknown -> a "don't know" line, never an invented "không có".
Deterministic hot-path checks run on every reply before it is returned: no
`forbidden_terms`, and every number must appear in the case or the student's words.
On violation: regenerate once, else fall back to a tier-3 line.
"""

from __future__ import annotations

import json
import re

from avp_api.providers.llm import LLMProvider

_STATIC_PREFIX = (
    "Bạn đóng một VAI trong buổi luyện hỏi bệnh: người trả lời bác sĩ, mô tả ở mục "
    "VAI CỦA BẠN trong hồ sơ bên dưới. Giữ đúng vai đó suốt buổi.\n"
    "Nói tiếng Việt đời thường, thân mật; gọi người hỏi là 'bác sĩ'. "
    "Trả lời NGẮN (tối đa 2 câu ngắn). Bạn KHÔNG phải nhân viên y tế: không dùng "
    "thuật ngữ chuyên môn, không chẩn đoán, không nói tên bệnh hay phân độ.\n"
    "QUY TẮC:\n"
    "1. Chỉ kể đúng những điều có trong HỒ SƠ bên dưới. Không bịa thêm triệu chứng, "
    "con số, hay kết quả.\n"
    "2. Nếu bác sĩ hỏi điều KHÔNG có trong hồ sơ: dùng một câu 'không rõ/chưa để ý'. "
    "TUYỆT ĐỐI không nói 'không bị', 'không có' cho triệu chứng chưa được ghi (tránh "
    "phủ định sai). Chỉ phủ định điều hồ sơ ghi rõ là 'không'.\n"
    "3. Không bao giờ nói ra các TỪ CẤM.\n"
)

# informant.role -> (role noun in the prompt, transcript label)
_ROLES: dict[str, tuple[str, str]] = {
    "mother": ("mẹ", "Mẹ"),
    "father": ("bố", "Bố"),
    "relative": ("người nhà", "Người nhà"),
    "self": ("người bệnh", "Người bệnh"),
}
_AGE_UNITS = {"days": "ngày tuổi", "weeks": "tuần tuổi", "months": "tháng tuổi", "years": "tuổi"}
_SEXES = {"male": "nam", "female": "nữ"}
_DIALECTS = {"north": "miền Bắc", "central": "miền Trung", "south": "miền Nam"}


def _role(case: dict) -> str:
    role = case.get("patient", {}).get("informant", {}).get("role", "mother")
    return role if role in _ROLES else "relative"


def speaker_label(case: dict) -> str:
    """Transcript label for the informant's lines ("Mẹ", "Người bệnh", ...)."""
    return _ROLES[_role(case)][1]


def _role_block(case: dict) -> str:
    """Who the LLM plays, from the case's `patient` block only (no clinical facts)."""
    p = case.get("patient", {})
    age = p.get("age") or {}
    age_txt = ""
    if age.get("value") is not None:
        age_txt = f"{age['value']} {_AGE_UNITS.get(age.get('unit'), '')}".strip()
    parts = (p.get("name"), age_txt, _SEXES.get(p.get("sex"), ""), p.get("occupation"))
    who = ", ".join(x for x in parts if x and x != "N/A")
    role = _role(case)
    if role == "self":
        line = f"Bạn CHÍNH LÀ người bệnh ({who}) và tự kể bệnh của mình."
    else:
        name = p.get("informant", {}).get("name")
        named = f" ({name})" if name else ""
        line = (
            f"Bạn là {_ROLES[role][0]}{named} của người bệnh ({who}), "
            "đưa người bệnh đi khám và kể thay."
        )
    persona = p.get("persona", {})
    lines = ["VAI CỦA BẠN: " + line]
    if persona.get("speech_style"):
        lines.append(f"Cách xưng hô, nói năng: {persona['speech_style']}.")
    if persona.get("dialect") in _DIALECTS:
        lines.append(f"Giọng {_DIALECTS[persona['dialect']]}.")
    if persona.get("personality") or persona.get("emotional_state"):
        lines.append(
            f"Tính cách: {persona.get('personality', '')}; "
            f"tâm trạng: {persona.get('emotional_state', '')}."
        )
    return "\n".join(lines)


def _facts_block(case: dict) -> str:
    lines: list[str] = [_role_block(case)]
    lines.append("Những điều bạn biết và có thể kể (chỉ khi được hỏi đúng chủ đề):")
    for h in case.get("history", []):
        polarity = h.get("polarity")
        tag = {
            "positive": "",
            "negative": " [có thể phủ định]",
            "unknown": " [để ngỏ: dùng câu không rõ]",
        }.get(polarity, "")
        lines.append(f'- {h.get("topic")}{tag}: "{h.get("lay_response")}"')
    fb = case.get("fallback_lines", {})
    lines.append("Câu dùng khi KHÔNG biết (tier 3): " + " / ".join(fb.get("unknown_symptom", [])))
    lines.append("Câu khi hỏi xét nghiệm chưa làm: " + " / ".join(fb.get("not_ordered_lab", [])))
    lines.append("TỪ CẤM (không được nói): " + ", ".join(case.get("forbidden_terms", [])))
    return "\n".join(lines)


def build_system_prompt(case: dict) -> str:
    """Static prefix + compiled case. Stable per case, so it caches across turns."""
    return _STATIC_PREFIX + "\n--- HỒ SƠ CA BỆNH ---\n" + _facts_block(case)


def _allowed_numbers(case: dict, student_text: str) -> set[str]:
    nums = set(re.findall(r"\d+", json.dumps(case, ensure_ascii=False)))
    nums |= set(re.findall(r"\d+", student_text))
    return nums


def _tier3_line(case: dict) -> str:
    lines = case.get("fallback_lines", {}).get("unknown_symptom") or ["Dạ em không rõ ạ."]
    return lines[0]


def verify_patient_reply(reply: str, case: dict, student_text: str) -> tuple[str, list[str]]:
    """Deterministic hot-path check. Returns (safe_reply, violations)."""
    violations: list[str] = []
    low = reply.lower()
    for term in case.get("forbidden_terms", []):
        if term and term.lower() in low:
            violations.append(f"forbidden_term:{term}")
    allowed = _allowed_numbers(case, student_text)
    for n in re.findall(r"\d+", reply):
        if n not in allowed:
            violations.append(f"number:{n}")
    if violations:
        return _tier3_line(case), violations
    return reply, []


def _render_prompt(transcript: list[dict], student_text: str, speaker: str = "Mẹ") -> str:
    lines: list[str] = []
    # System turns (e.g. recorded exam findings) are not the informant's words and
    # may hold clinical terms; never feed them back as their own lines.
    convo = [t for t in transcript if t.get("speaker") in ("student", "patient")]
    for t in convo[-8:]:
        who = "Bác sĩ" if t.get("speaker") == "student" else speaker
        lines.append(f"{who}: {t.get('text')}")
    lines.append(f"Bác sĩ: {student_text}")
    lines.append(f"{speaker}:")
    return "\n".join(lines)


def respond(
    case: dict, transcript: list[dict], student_text: str, provider: LLMProvider
) -> tuple[str, dict]:
    """Produce the patient reply plus a guardrail record for the turn."""
    system = build_system_prompt(case)
    prompt = _render_prompt(transcript, student_text, speaker_label(case))

    raw = provider.generate(prompt=prompt, system_prompt=system)
    reply, violations = verify_patient_reply(raw, case, student_text)
    guardrail: dict = {"violations": violations, "regenerated": False, "tier3_fallback": False}

    if violations:
        # Regenerate once, naming the violation (guardrails.md).
        retry_prompt = (
            prompt + f"\n[Hệ thống: câu trước vi phạm {violations}. Chỉ trả lời bằng "
            "thông tin trong hồ sơ, không dùng từ cấm, không thêm con số lạ.]"
        )
        raw2 = provider.generate(prompt=retry_prompt, system_prompt=system)
        reply2, violations2 = verify_patient_reply(raw2, case, student_text)
        guardrail["regenerated"] = True
        if violations2:
            guardrail["tier3_fallback"] = True
            guardrail["violations"] = violations2
            reply = _tier3_line(case)
        else:
            reply, guardrail["violations"] = reply2, []
    return reply, guardrail
