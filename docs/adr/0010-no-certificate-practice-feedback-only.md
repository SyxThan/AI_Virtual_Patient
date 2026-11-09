# ADR-0010: No certificate; practice feedback only

- Status: Accepted
- Date: 2026-11-09
- Deciders: Team TRINITY (human), Claude Code
- Related: AVP-005; CLAUDE.md "Hard rules" 4; docs/specs/product-scope.md "Clinician gate"

## Context
The proposal mentioned a "clinical competency certificate" (PDF + QR). The MVP
scores students with an automated rubric that is not a validated assessment
instrument, and clinical content is unverified until a clinician reviews it.
Presenting output as a certificate would overclaim and mislead.

## Decision
We will present all evaluation output as **practice feedback only**. The product
never uses the word "certificate" and never claims to replace instructors or to
be an official assessment. Result pages state the OSCE output is learning
feedback. A practice-report PDF, if any, is Layer 2 and carries practice wording
only.

## Consequences
- UI copy, README and slides avoid certification language (Evidence rule,
  product-scope.md).
- No legal/ethical exposure from implying accredited assessment.

## Alternatives considered
- Ship a certificate PDF as the proposal described: rejected — unverified content
  and an un-validated rubric cannot back a certificate.
