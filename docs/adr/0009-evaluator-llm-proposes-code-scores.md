# ADR-0009: Evaluator — LLM proposes, code scores

- Status: Accepted
- Date: 2026-11-09
- Deciders: Team TRINITY (human), Claude Code
- Related: AVP-005; CLAUDE.md "Hard rules" 4; docs/specs/evaluation.md

## Context
The OSCE score must be trustworthy and reproducible, and must not silently credit
a criterion the student never met. An LLM alone can hallucinate that a criterion
was satisfied.

## Decision
We will have the **LLM propose** each criterion's outcome with evidence — a
`turn_idx` plus a **verbatim student quote** — a **deterministic verifier** in
code check that the quote exists at that turn, and **code compute the total** from
the versioned rubric. **No evidence means never `met`.** Output is practice
feedback: we never write "certificate" or claim to replace instructors
(see ADR-0010).

## Consequences
- Re-scoring a transcript reproduces the same total (tested in AVP-013).
- Unsupported "met" claims are rejected by the verifier.
- The rubric is versioned; scores are traceable to a rubric version.

## Alternatives considered
- Trust the LLM's self-reported score: rejected — not reproducible, not auditable.
- Pure keyword matching without an LLM: rejected — misses paraphrase; the LLM
  proposes, code verifies.
