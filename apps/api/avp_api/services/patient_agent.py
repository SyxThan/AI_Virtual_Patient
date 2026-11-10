"""Patient Agent: the mother of an 18-month-old (hot path, AVP-009).

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
    "Bạn đóng vai NGƯỜI MẸ của một bé 18 tháng tuổi đang được bác sĩ hỏi bệnh. "
    "Nói tiếng Việt đời thường, thân mật, lo lắng; xưng 'em', gọi 'bác sĩ'. "
    "Trả lời NGẮN (tối đa 2 câu ngắn). Bạn KHÔNG phải nhân viên y tế: không dùng "
    "thuật ngữ chuyên môn, không chẩn đoán, không nói tên bệnh hay phân độ.\n"
    "QUY TẮC:\n"
    "1. Chỉ kể đúng những điều có trong HỒ SƠ bên dưới. Không bịa thêm triệu chứng, "
    "con số, hay kết quả.\n"
    "2. Nếu bác sĩ hỏi điều KHÔNG có trong hồ sơ: dùng một câu 'không rõ/chưa để ý'. "
    "TUYỆT ĐỐI không nói 'cháu không bị' cho triệu chứng chưa được ghi (tránh phủ "
    "định sai). Chỉ phủ định điều hồ sơ ghi rõ là 'không'.\n"
    "3. Không bao giờ nói ra các TỪ CẤM.\n"
)


def _facts_block(case: dict) -> str:
    lines: list[str] = []
    persona = case.get("patient", {}).get("persona", {})
    if persona:
        lines.append(
            f"Tính cách: {persona.get('personality', '')}; "
            f"tâm trạng: {persona.get('emotional_state', '')}."
        )
    lines.append("Những điều mẹ biết và có thể kể (chỉ khi được hỏi đúng chủ đề):")
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


def _render_prompt(transcript: list[dict], student_text: str) -> str:
    lines: list[str] = []
    # System turns (e.g. recorded exam findings) are not the mother's words and
    # may hold clinical terms; never feed them to her as her own lines.
    convo = [t for t in transcript if t.get("speaker") in ("student", "patient")]
    for t in convo[-8:]:
        who = "Bác sĩ" if t.get("speaker") == "student" else "Mẹ"
        lines.append(f"{who}: {t.get('text')}")
    lines.append(f"Bác sĩ: {student_text}")
    lines.append("Mẹ:")
    return "\n".join(lines)


def respond(
    case: dict, transcript: list[dict], student_text: str, provider: LLMProvider
) -> tuple[str, dict]:
    """Produce the patient reply plus a guardrail record for the turn."""
    system = build_system_prompt(case)
    prompt = _render_prompt(transcript, student_text)

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
