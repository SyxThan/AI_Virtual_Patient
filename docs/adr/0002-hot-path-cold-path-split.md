# ADR-0002: Hot path (Patient) vs cold path (Evaluator, Debrief)

- Status: Accepted
- Date: 2026-11-09
- Deciders: Team TRINITY (human), Claude Code
- Related: AVP-005; CLAUDE.md "Architecture"; docs/specs/tech-stack.md, guardrails.md

## Context
During the interview the student expects an answer fast (target: first audio
< 1.5 s, a target, not a measured result). Evaluation and debriefing are
expensive (structured scoring, RAG with citations) but can run after the
interview.

## Decision
We will split work into a **hot path** and a **cold path**. Hot path, during the
interview: only the Patient Agent, driven by one case-derived system prompt that
is compiled and cached per case. **No vector-DB / RAG call per turn** and no
blocking DB write before audio starts. **Cold path**, after the interview, async:
the Evaluator Agent then the Debriefing Agent (RAG with citations), run as `jobs`
rows picked up by a worker.

## Consequences
- The turn loop stays short and predictable; expensive work never blocks a reply.
- Transcript persistence and evaluation are decoupled from the live turn.
- Latency is something we can later measure per path (evals/), not guess.

## Alternatives considered
- Evaluate inline each turn: rejected — adds cost and latency to the hot path.
- RAG on every patient turn for "richer" answers: rejected — violates medical
  safety (the patient speaks only from the case JSON) and blows the latency budget.
