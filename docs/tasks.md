# Task list

Mirror of the team's workbook `AI_Virtual_Patient_MVP_30_Day_Plan` (Backlog AVP-001..030, Daily Plan). IDs AVP-031..038 and AVP-101+ are **added by this repo**, not in the workbook. The workbook stays the human source for status; this file is what agents read. Do not edit the workbook from here.

Every code task starts with `python scripts/git_task.py preflight AVP-xxx` (docs/git-workflow.md) and ends with a pushed branch and a PR whose squash commit carries `[AVP-xxx]`. A dependency counts as done when that tag is on `origin/main` (human tasks: confirmed by a person).

Owner: **C** = Claude Code, **A** = delegate to agy (docs/agy-delegation.md), **H** = human or clinician, "A*" = agy writes code, Claude writes the content it consumes. Pri = P0..P3 from the workbook. Day = planned day. Each task is done only when its acceptance passes and the Definition of Done in product-scope.md holds.

Stack note: the workbook says React; this repo uses Next.js (decided by the team). Branch names follow the workbook: `<type>/avp-NNN-slug` where type is feat, fix, test, docs, chore (research tasks use docs).

## Scope & research
| ID | Day | Pri | Task | Owner | Depends | Acceptance |
|---|---|---|---|---|---|---|
| AVP-001 | 1 | P0 | MVP scope and out-of-scope list (product-scope.md) agreed by all | H | | Team agrees; every task has owner and acceptance; decision D-1 (avatar) answered |
| AVP-002 | 2 | P1 | Interview 3-5 students and a lecturer or doctor | H | AVP-001 | At least 5 concrete insights; review dates booked |
| AVP-033 | 1 | P0 | Find a clinician reviewer and two raters | H | | Names and dates recorded (risk R-02) |
| AVP-031 | 1 | P0 | Git setup per docs/git-workflow.md: private remote, first commit, protect `main` (PR, at least 1 reviewer, no force-push, squash only), identities | H | | `git_task.py preflight AVP-006` passes setup checks |

## Clinical scenario
| ID | Day | Pri | Task | Owner | Depends | Acceptance |
|---|---|---|---|---|---|---|
| AVP-003 | 3 | P0 | case-001 JSON with known/unknown/disclosure, schema validate | C + H | AVP-001 | `make validate-cases` passes; unknown never turned into negative |
| AVP-004 | 3 | P0 | Versioned OSCE rubric with anchors, expected_questions, evidence requirement | C + H | AVP-003 | Every criterion has anchors 0/1/2 and expected questions |
| AVP-016 | 15 | P0 | Clinician review of case and rubric (Clinical review days 3, 15, 25) | H | AVP-003, AVP-004, AVP-033 | `review.status` set, or clearly shown unreviewed |

## Architecture and foundation
| ID | Day | Pri | Task | Owner | Depends | Acceptance |
|---|---|---|---|---|---|---|
| AVP-005 | 4 | P0 | Architecture decisions and API contract (ADRs, OpenAPI skeleton) | C + H | AVP-001 | Module boundaries and OpenAPI agreed |
| AVP-034 | 4 | P0 | Supabase projects `avp-dev` and `avp-demo`; session-mode pooler URL; IPv6 test; plan limits (pausing, backups); enable `vector` | H | | `psql "$DATABASE_URL" -c "select 1"` works; answers recorded in database.md |
| AVP-006 | 5 | P0 | Repo scaffold: FastAPI, Next.js, Makefile targets, CI, env example, PR template, README | C | AVP-005 | Fresh clone runs per README; CI passes |
| AVP-007 | 6 | P0 | Alembic setup + initial migration from `docs/specs/schema.sql` (RLS, revokes); `make db-check-rls` | C | AVP-005, AVP-034 | Migration applies on `avp-dev` and clean local Postgres; RLS check returns zero rows |
| AVP-037 | 6 | P0 | Walking skeleton on staging: health endpoint + web page deployed, env and CORS working (risk R-08) | C + H | AVP-006, AVP-034 | Another person opens the staging URL |
| AVP-035 | 5 | P1 | `scripts/validate_cases.py` + tests; `make gen-client` OpenAPI to TS client | A | AVP-006 | Passes on case-001, fails on a broken fixture; client regenerates without diff |
| AVP-039 | 5 | P2 | Claude skills for the MVP stack (`.claude/skills/`); link from CLAUDE.md | C | AVP-006 | Each skill specific to the real stack/specs; build/lint unaffected (added by this repo) |

## Patient, session, chat
| ID | Day | Pri | Task | Owner | Depends | Acceptance |
|---|---|---|---|---|---|---|
| AVP-008 | 7 | P0 | Scenario loader (`make load-cases`, versions, hash) + session API incl. guest token | A* | AVP-003, AVP-007 | Unchanged file is a no-op; changed file creates new version; ownership check on session routes from day one |
| AVP-009 | 8 | P0 | Text Patient Agent: prompt builder, unknown policy, disclosure rules, hot-path checks | C | AVP-003, AVP-008 | No invented unknowns; consistent across turns |
| AVP-010 | 9 | P0 | Chat UI vertical slice (Next.js, generated client) | A | AVP-008, AVP-009, AVP-035 | 5 complete turns locally; API errors shown |
| AVP-011 | 10 | P0 | Regression and red-team suite (20+ cases, T-PAT-01..07), result file | C | AVP-009 | `make redteam` writes `evals/results/redteam-*.json`; no Critical failure |
| AVP-012 | 11 | P0 | Transcript persistence and session lifecycle (finish, idempotent turns) | A | AVP-007, AVP-010 | Refresh keeps order and content (T-SESSION-01) |

## Evaluation
| ID | Day | Pri | Task | Owner | Depends | Acceptance |
|---|---|---|---|---|---|---|
| AVP-013 | 12 | P0 | Deterministic rubric engine and scoring code (evaluation.md) | C | AVP-004, AVP-012 | Re-score reproduces total; no evidence means not met |
| AVP-014 | 13 | P0 | Evaluator agent, structured output, evidence verifier, job worker (`for update skip locked`) | C (agent), A (verifier, worker) | AVP-013 | T-OSCE-01, 02, 05 pass; two workers process each job once |
| AVP-015 | 14 | P0 | OSCE result UI with evidence links and learning-feedback notice | A | AVP-014 | Evidence points at the right turn |
| AVP-026 | 25 | P0 | Evaluator vs reviewer comparison on 10-20 transcripts; agreement script | A* | AVP-014, AVP-016 | `evals/results/agreement-*.json` with n and limits |

## Debrief and RAG
| ID | Day | Pri | Task | Owner | Depends | Acceptance |
|---|---|---|---|---|---|---|
| AVP-017 | 16 | P1 | Source registry and permission check (`rights_checked`) | C | AVP-016 | Each source has metadata and rights status |
| AVP-018 | 17 | P1 | Embedding model choice + migration, ingest, retrieval, citation payload | C, then A | AVP-017 | T-RAG-01, 02 pass; vector index added |
| AVP-019 | 18 | P1 | Debriefing agent: every claim cited or marked unverified; debrief UI | C, A | AVP-015, AVP-018 | Each recommendation has source id and section |

## Voice
| ID | Day | Pri | Task | Owner | Depends | Acceptance |
|---|---|---|---|---|---|---|
| AVP-020 | 19 | P2 | STT provider adapter and audio upload limits | A | AVP-009 | Editable Vietnamese transcript; provider failure keeps session |
| AVP-021 | 20 | P2 | TTS adapter with text fallback; turn latency logging | A | AVP-020 | Reply audio plays; TTS error falls back to text |
| AVP-022 | 21 | P2 | Voice UI states, transcript correction, mic permission handling | C | AVP-020, AVP-021 | 10 voice turns on target machine; text fallback |

## History, security, QA, release
| ID | Day | Pri | Task | Owner | Depends | Acceptance |
|---|---|---|---|---|---|---|
| AVP-023 | 22 | P1 | Practice history and score summary | A | AVP-012, AVP-015 | Correct per account or guest token |
| AVP-024 | 23 | P0 | Privacy and access-control baseline: consent notice, retention, delete-my-data, rate limit, RLS check, no secrets or audio in logs | C | AVP-007, AVP-022 | T-SEC-01, T-SEC-02 pass |
| AVP-025 | 24 | P0 | E2E integration suite with mock providers (T-E2E-01) | C | AVP-019, AVP-022, AVP-023 | Flow repeats without manual fixes |
| AVP-027 | 26 | P0 | Dockerfile, staging deploy, health check, migration guide | C | AVP-025 | Staging URL; secrets not in image or repo |
| AVP-036 | 27 | P1 | UX polish: loading, retry, empty states, accessibility basics | A, C | AVP-027 | No known blocker; no false success states |
| AVP-038 | 14 | P1 | Recruit 5-10 pilot participants (book by Day 14; risk R-10) | H | AVP-002 | Names and dates; else internal-test fallback recorded |
| AVP-028 | 28 | P1 | Pilot usability test | H | AVP-027, AVP-038 | Notes, or the reason it did not happen |
| AVP-029 | 29 | P0 | README, demo script, release notes, known limitations | C | AVP-027 | Demo runs 3 times in a row; no certificate claim |
| AVP-030 | 30 | P0 | Tag `release/mvp-v0-1`, release gate (quality-gates.md), retrospective | H + C | AVP-028, AVP-029 | Gate table filled with evidence |

## Layer 2 (v0.2, starts only after the release gate or by scope-gate decision)
| ID | Task | Owner | Depends |
|---|---|---|---|
| AVP-101 | Exam and lab ordering, mock results, overuse penalty | A | AVP-030 |
| AVP-102 | Vitals state machine | A | AVP-101 |
| AVP-103 | Streaming voice pipeline and latency benchmark (p50/p95) | C, A | AVP-022 |
| AVP-104 | 3D avatar, viseme lip-sync, click-to-examine bound to `exam[].action` | C, A | AVP-101, AVP-103 |
| AVP-105 | Practice-report PDF with QR (practice wording only) | A | AVP-019 |
| AVP-106 | Convert more of the 53 source cases | A* | AVP-030 |

## Rituals (from the workbook)
Daily sync 10-15 min; PR review for every PR; integration checkpoints Days 5, 10, 15, 20, 24, 27; clinical review Days 3, 15, 25; scope gate end of Days 7, 14, 21; release rehearsal Days 29-30.

First sessions: AVP-031, AVP-033 and AVP-034 are people tasks, start now. Then AVP-006, AVP-007; try agy on AVP-035 and record the result in the delegation log.
