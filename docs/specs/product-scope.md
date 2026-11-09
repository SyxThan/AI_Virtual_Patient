# Product scope: 30-day MVP

Source of truth for the plan: the team's workbook `AI_Virtual_Patient_MVP_30_Day_Plan` (Daily Plan, Backlog AVP-001..030, Architecture, Case & Rubric, Test Plan, Risks, ADRs, Rituals, Release Gate). This repo mirrors it in `docs/tasks.md`; where this repo adds or changes something, `docs/tasks.md` says so.

## What the MVP must prove
A student interviews a synthetic patient in Vietnamese, the patient answers only from the scenario, the transcript is saved, an OSCE-style checklist is scored with evidence, a debrief cites sources, and the student can reopen the history. One complete case, end to end, running on staging three times in a row.

## Priorities
| Pri | Content |
|---|---|
| P0 | Trustworthy scenario, text conversation, transcript, rubric with evidence, access control, deploy, release docs |
| P1 | Debrief with RAG citations, history, pilot |
| P2 | Voice, turn-based (STT then LLM then TTS) |
| P3 | Polish; everything in "Layer 2" below |

## Out of scope for the 30 days
Full 3D avatar and lip-sync; full-duplex realtime voice; unlimited case generation; multiple specialties; certificates with any official standing; replacing instructors in real exams. Added by this repo: exam and lab ordering UI, vitals state machine, converting the other 52 source cases, instructor/LMS features, payments.

## Layer 2 (starts only after the release gate, or by a written scope-gate decision)
Exam and lab ordering with overuse penalty, vitals state machine, streaming voice with latency benchmark, 3D avatar with lip-sync and click-to-examine, practice-report PDF with QR verification, the other source cases. Tasks are listed in `docs/tasks.md` under v0.2. The case schema already carries exam and lab data so Layer 2 does not require a rewrite.

## Open decision D-1 (needs the human)
The 29 Oct demo direction (3D avatar, click-to-examine, vitals, voice-to-voice) is larger than this 30-day scope. Default in this repo: 30-day scope first, Layer 2 after the gate. If the competition needs the avatar, something P1 or P2 must be cut; record that as a scope-gate decision (Day 7, 14 or 21), not a silent addition.

## Claims in the proposal versus what the MVP will say
| Proposal says | MVP says |
|---|---|
| Voice-to-voice under 1.5 s, full duplex | Turn-based voice; latency measured and reported; 1.5 s is a target for Layer 2 |
| Hallucination "eliminated" / "absolute" | Measured rate of unsupported clinical statements, with number of turns |
| Tier 3: patient answers "no" to unlisted symptoms | Unknown policy: the patient neither confirms nor denies (see guardrails.md) |
| Cohen's kappa >= 0.82 | A target; AVP-026 reports measured agreement with sample size and limits |
| "Clinical competency certificate" PDF + QR | Practice feedback only; no certificate wording (ADR-010); a practice-report PDF is Layer 2 |
| 53 digitised cases | 1 designed and reviewed synthetic case; the 53 are unreviewed source data |
| Saves over 80% of OSCE cost | An estimate, not a measurement; not shown as a result |
| 3D avatar | Layer 2 |

## Definition of Done (every task)
Code runs; tests appropriate to the change; API/schema docs updated; limitations and known errors recorded; no secrets; PR reviewed by at least one other team member; acceptance criteria met.

## Evidence rule
Any figure in the proposal, slides or README (latency, kappa, hallucination rate, cost, savings, user counts) must trace to a file in `evals/results/` or to a cited external source. Targets are written as targets.

## Clinician gate
Nothing is labelled "clinically verified" until a physician or faculty member has reviewed that case's JSON (`review.status = clinician_reviewed`, name and date). Without a reviewer, the UI and README say the clinical content is unverified (risk R-02). Result pages say the OSCE output is learning feedback, not an official assessment.

## Data and rights
Synthetic cases only; no real patient records. Source text comes from the BV Bệnh Nhiệt đới TP.HCM 2023 guideline and Ministry of Health decisions: record it as third-party material in the proposal's IP section and ingest only sources whose terms allow it (AVP-017). Student transcripts are personal data: consent notice, retention limit, delete-my-data before any pilot.

## Known issues in the 53-case source data
Textbook wording instead of patient wording; history, exam and red flags merged in one cell; rubric limited to a diagnosis row; no management section; about 82 of roughly 180 lab rows numeric; HFMD lists two glucose values (9.8 and 8.9 mmol/L); HFMD overuse orders apply to grades 1 and 2a while the station vitals suggest 2b; disease 44 has no red-flag section.
