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
