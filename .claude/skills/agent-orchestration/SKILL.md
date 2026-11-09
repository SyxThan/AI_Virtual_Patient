---
name: agent-orchestration
description: Use when building or changing the Patient, Evaluator, or Debriefing agents — prompts, structured I/O schemas, provider adapters, guardrails, and hot/cold path placement.
---

# Agent orchestration

Three business agents. Read `docs/specs/guardrails.md` before anything that produces
patient replies, and `docs/specs/evaluation.md` for Evaluator/Debrief.

## Placement (ADR-0002)
- **Patient Agent** = hot path, during the interview. One cached system prompt per case; no RAG, no per-turn vector call. Target first audio < 1.5 s (a target, not a result).
- **Evaluator** then **Debriefing** = cold path, async via `jobs` rows after the interview.

## Provider adapters (ADR-0006)
- All LLM/STT/TTS calls go through adapters in `avp_api/providers/` with a **fake** for tests. Provider names, model ids and keys come from env (`LLM_PROVIDER`, `LLM_MODEL_PATIENT`, `LLM_MODEL_EVALUATOR`, …). Never hard-code. Default to the latest capable Claude models.

## Patient Agent — the hard rules (CLAUDE.md rule 1, guardrails.md)
- **Tier 1** (clinical facts): say only what `data/cases/<id>.json` contains, in `lay_response` wording or a faithful paraphrase. Never add/change/omit-then-contradict.
- **Tier 2** (persona/social): may improvise non-medical detail; store in `improvised_facts` and reuse.
- **Tier 3** (unknown): a layperson "không rõ / chưa để ý" line — **never an invented "không có"**. Only `history` entries with `polarity: negative` may be denied. Log every tier-3 hit to `fallback_hits`.
- **Hot-path checks** (deterministic, no extra LLM call) on every reply: numbers must appear in the case JSON or the student's words; no `forbidden_terms` (diagnosis/grade/drug names); length cap; Vietnamese only. Fail → regenerate once naming the violation → else a tier-3 line.
- **Prompt layout (cache-friendly)**: static prefix + compiled case kept byte-identical across turns; transcript + session memory last.

## Evaluator — LLM proposes, code scores (ADR-0009)
- The LLM returns, per criterion, an outcome + evidence (`turn_idx` + verbatim student quote). Code verifies the quote exists at that turn; code computes the total from the versioned rubric. **No evidence ⇒ never `met`** (T-OSCE-02/05). See the `osce-scoring` skill.

## Debriefing — cited or marked unverified (ADR-0005)
- Every claim cites a source (`source_id` + section) or is marked unverified. No invented citations (T-RAG-02). See the `rag-citation` skill.

## Structured output
- Use Pydantic models for every agent's output; validate before trusting. Schemas sketched in `docs/specs/openapi.yaml` (`Evaluation`, `Debrief`). Never let free-form LLM text drive scoring or patient facts.
