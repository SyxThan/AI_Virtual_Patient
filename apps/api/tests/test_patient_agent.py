"""Patient Agent guardrail tests (AVP-009, Hard Rule 1)."""

from __future__ import annotations

from avp_api.providers.llm import FakeLLMProvider, LLMProvider
from avp_api.services import patient_agent

CASE = {
    "patient": {"persona": {"personality": "lo lắng", "emotional_state": "hoang mang"}},
    "history": [
        {"topic": "Sốt", "polarity": "positive", "lay_response": "Dạ cháu sốt mấy bữa rồi ạ."},
        {"topic": "Dị ứng", "polarity": "unknown", "lay_response": "Dạ em không rõ ạ."},
    ],
    "forbidden_terms": ["EV71", "độ 2b", "enterovirus"],
    "fallback_lines": {
        "unknown_symptom": ["Dạ em không rõ ạ."],
        "not_ordered_lab": ["Dạ chưa làm xét nghiệm đó ạ."],
        "out_of_scope": ["Dạ bác sĩ giải thích giúp em ạ."],
    },
}


class _FixedProvider(LLMProvider):
    def __init__(self, text: str) -> None:
        self._text = text

    def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
        return self._text


def test_forbidden_term_is_replaced() -> None:
    safe, violations = patient_agent.verify_patient_reply("Bé bị EV71 rồi ạ.", CASE, "")
    assert any(v.startswith("forbidden_term:") for v in violations)
    assert "ev71" not in safe.lower()


def test_number_not_in_case_is_replaced() -> None:
    safe, violations = patient_agent.verify_patient_reply("Dạ sốt 42 độ ạ.", CASE, "")
    assert "number:42" in violations
    assert "42" not in safe


def test_number_from_student_is_allowed() -> None:
    _safe, violations = patient_agent.verify_patient_reply("Dạ 39 độ ạ.", CASE, "sốt 39 độ à")
    assert violations == []


def test_forbidden_reply_falls_back_to_tier3() -> None:
    reply, guardrail = patient_agent.respond(
        CASE, [], "con có bị gì", _FixedProvider("Cháu bị độ 2b ạ.")
    )
    assert "2b" not in reply
    assert guardrail["tier3_fallback"] is True
    assert guardrail["regenerated"] is True


def test_fake_provider_unknown_question_is_safe() -> None:
    reply, guardrail = patient_agent.respond(
        CASE, [], "cháu có bị tiêu chảy không", FakeLLMProvider()
    )
    assert reply  # non-empty
    assert guardrail["violations"] == []


# --- role follows the case's informant (AVP-159) ---------------------------------


class _RecordingProvider(LLMProvider):
    def __init__(self) -> None:
        self.calls: list[tuple[str, str | None]] = []

    def generate(self, prompt, system_prompt=None, temperature=0.2) -> str:
        self.calls.append((prompt, system_prompt))
        return "Dạ."


def _case_with(informant: str, age: dict, sex: str, name: str) -> dict:
    case = dict(CASE)
    case["patient"] = {
        "name": name,
        "age": age,
        "sex": sex,
        "occupation": "N/A",
        "informant": {"role": informant},
        "persona": {"personality": "bình tĩnh", "emotional_state": "mệt", "dialect": "north"},
    }
    return case


def test_static_prefix_names_no_fixed_role() -> None:
    # The old prefix hard-coded "the mother of an 18-month-old" for every case.
    assert "18 tháng" not in patient_agent._STATIC_PREFIX
    assert "NGƯỜI MẸ" not in patient_agent._STATIC_PREFIX


def test_adult_self_case_plays_the_patient() -> None:
    case = _case_with("self", {"value": 52, "unit": "years"}, "male", "Ông Lê Văn T.")
    rec = _RecordingProvider()
    patient_agent.respond(case, [], "Anh đau ở đâu?", rec)
    prompt, system = rec.calls[0]
    assert "Bạn CHÍNH LÀ người bệnh (Ông Lê Văn T., 52 tuổi, nam)" in system
    assert "Bạn là mẹ" not in system
    assert "Giọng miền Bắc." in system
    assert prompt.endswith("Người bệnh:")
    assert "Mẹ:" not in prompt


def test_mother_case_keeps_the_mother_label() -> None:
    case = _case_with("mother", {"value": 18, "unit": "months"}, "male", "Bé B.")
    rec = _RecordingProvider()
    transcript = [
        {"speaker": "student", "text": "Chào chị"},
        {"speaker": "patient", "text": "Dạ chào bác sĩ"},
    ]
    patient_agent.respond(case, transcript, "Bé sốt mấy ngày?", rec)
    prompt, system = rec.calls[0]
    assert "Bạn là mẹ của người bệnh (Bé B., 18 tháng tuổi, nam)" in system
    assert "Mẹ: Dạ chào bác sĩ" in prompt
    assert prompt.endswith("Mẹ:")


def test_system_prompt_is_stable_per_case() -> None:
    case = _case_with("father", {"value": 3, "unit": "years"}, "female", "Bé H.")
    assert patient_agent.build_system_prompt(case) == patient_agent.build_system_prompt(case)
    assert patient_agent.speaker_label(case) == "Bố"
