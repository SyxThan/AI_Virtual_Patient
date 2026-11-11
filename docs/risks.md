# Risk register

R-01 to R-10 are from the workbook. R-11 to R-14 are added by this repo; R-15 to R-17 cover Phase 2 (Slices 10-14). Review at each scope gate (Days 7, 14, 21) and at release rehearsal.

| ID | Risk | Likelihood | Impact | Pri | Early sign | Mitigation | Owner |
|---|---|---|---|---|---|---|---|
| R-01 | Patient agent invents or contradicts facts | High | Very high | P0 | T-PAT unknown or contradiction cases fail | Scenario JSON, disclosure rules, unknown policy, regression tests, fallback; hot-path output checks | AI/Backend |
| R-02 | No clinician to review case and rubric | Medium | Very high | P0 | No review slot booked in week 1 | Find a reviewer on Day 1 (AVP-033); label content unverified; no claim of clinical standard | Product/Clinical |
| R-03 | Auto-OSCE disagrees with expert judgement | High | High | P0 | Many false positives or negatives | Evidence per criterion, verifier, formative use only, AVP-026 comparison, report limits | AI/QA |
| R-04 | RAG sources under copyright or unclear rights | Medium | High | P0 | No permission record | Public or permitted sources only; store source and version; exclude unclear documents | Research |
| R-05 | Voice APIs cost money or hit quotas | Medium | High | P1 | Quota low, errors rising | Provider adapters, per-session turn limits, text fallback, cost tracking | Backend |
| R-06 | Voice latency breaks the demo | High | Medium | P1 | Slow replies in rehearsal | Turn-based voice, measure latency, cap prompt and context, no full duplex in MVP | Backend/Frontend |
| R-07 | Scope creep (3D, more specialties, certificates) | High | Very high | P0 | Out-of-scope tasks enter the sprint | Scope freeze; additions only after P0 is done and via a scope gate; Layer 2 list in `docs/tasks.md` | PM |
| R-08 | Deploy fails on env, migration or CORS | Medium | High | P0 | Works locally, fails on staging | Walking skeleton on staging by Day 6 (AVP-037), health check, migration guide | DevOps |
| R-09 | Session, transcript or secret leak | Medium | Very high | P0 | No access-control tests | Ownership checks from session creation (AVP-008), RLS on all tables, no long-term audio, minimal logs, secret scan on commit | Backend |
| R-10 | No time for user testing | Medium | Medium | P1 | No participants by Day 14 | Recruit by Day 14 (AVP-038); internal usability test as fallback, stated openly | Product |
| R-11 | Proposal claims exceed MVP evidence (kappa, latency, "zero hallucination", certificate, savings) | High | High | P0 | Slides quote numbers with no file behind them | Claims table in product-scope.md; evidence rule; wording review before submission | Product |
| R-12 | Work delegated to agy is wrong, out of scope, or silently produces nothing | Medium | Medium | P1 | Retries, scope violations, empty output | Wrapper checks scope, report and acceptance; delegation log; stop delegating a task type after repeated rework | Lead |
| R-13 | Supabase plan limits (pausing, backups, connections) disrupt the demo | Medium | High | P1 | Project paused, connection errors | Check plan policy (AVP-034), wake and test before rehearsals, session pooler, small pool | DevOps |
| R-14 | Unreviewed LLM-drafted lay wording is mistaken for verified clinical content | Medium | High | P0 | Facts with `author_added` or `draft` status shown in demo | Per-fact status, validator lists unreviewed items, UI banner when a case is unreviewed | Product/Clinical |
| R-15 | Auth or ownership bug exposes another student's transcript (Phase 2) | Medium | Very high | P0 | T-SEC-01/T-AUTH-01 failures, 200 on foreign session | JWKS verification in FastAPI only, one ownership check for guest and user, tests per route (AVP-106, AVP-109) | Backend |
| R-16 | Public deploy runs up LLM/STT/TTS cost | Medium | High | P0 | Spend alert, unusual turn volume | Per-session and per-IP limits, daily cap with Fake fallback (AVP-118), Google Cloud budget alerts | DevOps |
| R-17 | Real users before delete-my-data and privacy page exist | Medium | High | P0 | Pilot planned before Slice 13 | Slice 13 is a gate for any pilot with real students (AVP-115) | Product |
