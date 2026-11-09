# Case data schema

Machine-readable schema: `schemas/case.schema.json` (JSON Schema 2020-12). Worked example: `data/cases/_example_hfmd.draft.json` (illustrative, unreviewed).

## Why the shape differs from the source tables
The 53-case source puts history, exam findings and red flags into one "response" cell in textbook language. The Patient Agent needs them separated, gated and in lay words.

| Problem in source | Schema answer |
|---|---|
| Textbook wording in patient replies | `history[].lay_response` (what the patient says) kept apart from `clinical_note` |
| Findings merged in one cell | `history[]`, `exam[]`, `labs[]` are separate arrays with their own ids |
| Red flags buried in prose | `red_flag: true` on the history/exam entry that carries it |
| Fact reveals too early | History by `intents`; exam by `exam[].action`; labs by `name`/`aliases` (see guardrails.md) |
| Rubric = diagnosis only | `rubric.version` and `rubric.items[]` over 7 domains with 0/1/2 `anchors`, `expected_questions`, `weight`, `critical` |
| Unknown vs negative | `history[].polarity` may be `unknown`: the patient neither confirms nor denies (guardrails.md) |
| No treatment | optional `management[]` |
| Conflicting or missing numbers | `labs[].value/unit/ref_range` numeric where possible; conflicts go to `review.notes` |
| Severity not fixed | `presentation.severity_state {label, confirmed}`; overuse orders carry `applies_to_grades` |
| Unknown provenance | every fact has `origin`: `station` (exam station text), `source_table` (the 53-case table), `author_added` |

## Rules
1. `origin: author_added` means "someone, human or AI, supplied this and it is not in the source". It must be reviewed before the case is marked reviewed.
2. `review.status = clinician_reviewed` requires `reviewer` and `date`. Any edit to clinical content resets it to `draft`.
3. ids are stable: `h-*`, `e-*`, `l-*`, `r-*`. The Evaluator and the Debriefing reference them; never renumber.
4. `lay_response` is in Vietnamese as the informant would say it. No medical terms the family would not know. Those go in `forbidden_terms`.
5. Rubric `critical: true` items cap the total score if scored 0 (whether it caps is decided with the clinician in AVP-016; see evaluation.md).
6. Numbers appear in `labs[].value` only if the source has them; otherwise `value: null` and put the text in `result_text`.

## Storage
The JSON files in `data/cases/` are the source of truth. `make load-cases` copies them into the `cases` table as numbered versions (docs/specs/database.md); a session pins the version it started with, so editing a case never changes a finished session's evaluation.

## Validation (task AVP-035)
`make validate-cases` checks: JSON Schema, unique ids within a case, every rubric `domain` is covered at least once, `overuse_orders[].applies_to_grades` includes the case's `severity_grade` only when intended, and prints a list of `author_added` entries still unreviewed.

## Converting the 53 source cases (Layer 2, AVP-106)
- Script extracts the structural parts (labs, overuse orders, diagnosis row, citations) deterministically from the docx.
- History, exam and lay wording need splitting and rewriting: Claude drafts them as `origin: author_added` with `status: draft`; a clinician reviews. Do not delegate this to agy.
- Cases that are not the demo case stay `draft` and are not shown as "verified" anywhere.
