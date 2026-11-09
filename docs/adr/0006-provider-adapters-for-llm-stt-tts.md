# ADR-0006: LLM/STT/TTS behind provider adapters

- Status: Accepted
- Date: 2026-11-09
- Deciders: Team TRINITY (human), Claude Code
- Related: AVP-005; CLAUDE.md "Architecture", "Hard rules" 5; docs/specs/tech-stack.md

## Context
The product calls an LLM (patient, evaluator, debrief) and, in Layer P2, STT and
TTS. Providers and model ids change; tests must not hit the network or need real
keys; secrets must never be hard-coded.

## Decision
We will put every external model behind an **adapter** in
`apps/api/avp_api/providers/` (llm, stt, tts) with a **fake** implementation for
tests. Provider names, model ids and keys are read from env
(`LLM_PROVIDER`, `LLM_MODEL_PATIENT`, `LLM_MODEL_EVALUATOR`, `STT_*`, `TTS_*`, …);
they are **never hard-coded**. Default to the latest capable Claude models.

## Consequences
- Swapping a provider or model is a config change, not a code change.
- Unit tests run offline against fakes (no real keys, no network).
- One place to enforce rate/size limits and error shaping per provider.

## Alternatives considered
- Call provider SDKs directly from services: rejected — couples business logic to
  a vendor, breaks offline tests, scatters model ids.
