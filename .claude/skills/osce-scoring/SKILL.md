---
name: osce-scoring
description: Use when building or changing the OSCE rubric, the deterministic scoring engine, evidence verification, red-flag handling, or the practice-report output.
---

# OSCE scoring

Authoritative spec: `docs/specs/evaluation.md` (read it) and the rubric from AVP-004.
Output is **practice feedback, never a certificate or official assessment** (ADR-0010).

## Core principle (ADR-0009): LLM proposes, code scores
1. The Evaluator LLM proposes, per criterion: an outcome (`met` / `partial` / `not_met`) and **evidence** = `turn_idx` + a **verbatim** student quote.
2. A deterministic **verifier** in code checks the quote actually appears at that `turn_idx` in the stored transcript. A fabricated or absent quote ⇒ the item is downgraded and flagged (T-OSCE-05).
3. **Code** computes the total from the **versioned** rubric — not the LLM.
4. **No evidence ⇒ never `met`** (use `not_met` / `insufficient_evidence`, T-OSCE-02).

## Rubric
- Versioned; each criterion has anchors 0/1/2 and `expected_questions`. Credit by meaning, not exact words (T-OSCE-03). Store the rubric version with every result so a re-score reproduces the total (T-OSCE-04).

## Red flags
- Red-flag items are part of the rubric; surface missed red flags prominently in the result. The patient never names red flags or diagnoses (guardrails.md).

## Determinism / reproducibility
- Re-scoring a stored Evaluator output must reproduce the same total (pure function of rubric version + verified evidence). Measure and record LLM variance separately; never let it change a stored score silently.

## Output / UI (AVP-015)
- Show each criterion with its evidence link pointing to the exact turn. Include a learning-feedback notice. Never render the word "certificate" or claim to replace instructors.
- A practice-report PDF (if any) is **Layer 2** and uses practice wording only, no certificate/QR-as-credential.

## Pitfalls
- Don't let the LLM output the final score. Don't mark `met` without a verified quote. Don't invent criteria not in the versioned rubric.
