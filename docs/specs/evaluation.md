# Evaluator (Auto-OSCE) contract

Principle: **the LLM proposes, code decides.** The LLM reads the transcript and reports, per rubric criterion, what the student did and where. Code validates that evidence, then computes the score from the versioned rubric. No free-text total from the LLM, no pass without verified evidence.

## Pipeline
1. `POST /sessions/{id}/finish` sets the session to `completed` and enqueues a job `evaluate`.
2. Worker loads transcript (`turns`), the case version pinned by the session, and `rubric.version`.
3. LLM call with structured output (temperature low; model id, prompt version stored).
4. Schema validation. Invalid output: one retry, then the evaluation is `failed` with an error visible to the user.
5. Evidence verifier (deterministic code).
6. Scoring (deterministic code), stored with `scoring_version`.
7. UI polls the evaluation status.

## LLM output per criterion
| Field | Meaning |
|---|---|
| `criterion_id` | `r-*` id from the case rubric |
| `level` | 0, 1, 2, or null (insufficient evidence) |
| `evidence` | List of `{turn_idx, quote}`; quote is verbatim from a **student** turn |
| `feedback` | One or two sentences and a next step, plain Vietnamese |

Status derived by code: level 2 = `met`, 1 = `partial`, 0 = `unmet`, null = `insufficient_evidence`.

## Evidence rules
- `met` and `partial` need at least one evidence item that passes the verifier. The database enforces this (`evaluation_items` checks).
- `unmet` may have empty evidence: absence of a question cannot be proven by a quote. If the student made a related but incomplete attempt, cite those turns.
- `insufficient_evidence` when the transcript cannot support either answer (very short session, obvious speech-to-text failure). It scores 0 and is shown as "not enough evidence", never as a pass.
- Verifier: `turn_idx` exists, the turn's speaker is `student`, and the quote is a substring of that turn after Unicode NFC normalisation, whitespace collapsing and case folding. An item that fails is downgraded to `insufficient_evidence` and flagged; it is never kept as `met`.
- Meaning, not keywords: a differently worded but equivalent question counts (test T-OSCE-03). `expected_questions` give topics and sample phrasings, not exact-match lists.
- Communication criteria use only observable behaviours listed in the anchors (plain language, acknowledging worry, no leading questions). Never infer empathy from a single keyword. These criteria are reported as lower reliability.

## Scoring (code)
- Item score = `level / 2`; total = sum(weight x item score) / sum(weight), expressed 0 to 100.
- A `critical` criterion that is `unmet` or `insufficient_evidence` raises `critical_missed`; the result page shows it prominently. Whether it also caps the total is decided with the clinician in AVP-016 and recorded here.
- Re-scoring stored LLM output must reproduce the same total exactly. Re-running the LLM on the same transcript is measured, not assumed stable (see below).

## Repeatability test (T-OSCE-04)
Run the evaluator 5 times on each of the gold transcripts; report, per criterion, how often the status changes. Criteria that flip often get clearer anchors or a lower weight, or are marked low-reliability in the UI.

## Validation against a reviewer (AVP-026)
- 10 to 20 transcripts (synthetic or from consenting volunteers), scored independently by the evaluator and by at least one clinician or instructor, ideally two.
- Report: n transcripts, n criteria ratings, percent agreement, Cohen's kappa with a confidence interval (small n gives wide intervals), and false positives (evaluator says met, reviewer says not) listed separately because they are the harmful direction.
- Write limitations next to the numbers. No claim of replacing instructors. The proposal's kappa target is only quoted as a target.

## What the student sees
Per criterion: status, evidence turns linked to the transcript, feedback. Missed topics. A permanent notice: "Học liệu phản hồi để luyện tập, không phải kết quả đánh giá chính thức hay chứng chỉ." No wording such as certified, verified competence, or equivalent to an examiner.

## Failure behaviour
Provider timeout or invalid output: status `failed`, retry button, no partial score shown as final. Every evaluation stores model, prompt version, rubric version and scoring version so a result can be explained later.
