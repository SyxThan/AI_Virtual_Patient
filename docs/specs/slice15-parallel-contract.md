# Slice 15 parallel contract (4 agents, one PR each)

Every agent branches from `origin/feat/avp-125-slice15-design-foundation` (the foundation PR, stacked; base of its PR is still `main`), works in its own git worktree, and owns the files listed for it. Every file has exactly one owner, so the 4 PRs merge in any order. Need a change in a file you do not own? Do NOT make it: list it under "Integration follow-ups" in your final report (the lead does it in AVP-130).

Read first: `docs/specs/ui-design.md` (tokens, primitives, rules), `.claude/skills/frontend-ui/SKILL.md`, and the skills `frontend-design`, `tailwind-design-system`, `vercel-react-best-practices` (installed for the user). Paths below are relative to `apps/web/src/`.

## Ownership
| Agent | Task / branch | Owns (may edit) | vi.json blocks it may edit |
|---|---|---|---|
| L | AVP-126 `feat/avp-126-landing-bento` | `app/page.tsx`, NEW `components/landing/*` | `landing`, `home` |
| W | AVP-127 `feat/avp-127-workspace-bento` | `app/setup/*`, `app/session/*`, `components/workspace/*`, `components/guide/*`, `components/onboarding/*`, `components/avatar/AvatarCanvas.tsx` and `components/avatar/ExamFindingPanel.tsx` (styling of the frame and panel only) | `setup`, `setupUx`, `session`, `voice`, `avatar`, `exam`, `monitor`, `workspace`, `guide`, `onboarding` |
| D | AVP-128 `feat/avp-128-debrief-bento` | `app/debrief/*`, `components/debrief/*` | `debrief`, `debriefUx` |
| A | AVP-129 `feat/avp-129-account-bento` | `app/login/*`, `app/auth/*`, `app/profile/*`, `app/history/*`, `app/privacy/*`, `app/not-found.tsx`, `app/error.tsx`, `app/loading.tsx`, `components/auth/LoginForm.tsx`, `components/auth/AuthCallback.tsx` (styling only), `components/history/*`, `components/privacy/*` | `history`, `privacy`, `auth`, `profile`, `errors` |

**Forbidden for everyone:** `components/ui/*`, `components/shell/*`, `app/globals.css`, `app/layout.tsx`, `components/auth/AuthProvider.tsx`, `components/auth/ClaimGuestSession.tsx`, `components/auth/authErrors.ts`, `components/avatar/AvatarScene.tsx`, `components/avatar/AnatomyColliders.ts`, `components/avatar/LipSyncController.ts`, `hooks/*`, `lib/*` (incl. `lib/api-client/*`), `package.json`, `package-lock.json`, anything under `apps/api/`, `docs/`, `PROGRESS_TASK.md`, any `.env*` file, files owned by another agent.

## Rules
1. **Restyle, do not change behavior.** Keep every fetch, hook call, WebSocket message, route, prop contract, aria attribute and focus behavior. Keep component file names and default exports (other owners import them). You may split a big file into new files inside your own folders.
2. **vi.json:** edit only your blocks, textually (never re-serialize the file). Put NEW keys right after your block's opening line (`  "block": {`). Do not delete keys another file might use; grep `vi\.<block>\.<key>` before removing anything.
3. **Design system:** tokens and `components/ui/*` primitives only; no raw `gray-*`/`blue-*`/hex colors in classes. Red (`danger`) only for red flags and destructive actions. One primary action per view. Copy is sentence case, Vietnamese, plain; no all-caps eyebrows, no `·`-joined meta strings, no `→` in buttons.
4. **Safety rules hold:** no invented clinical numbers or metrics (placeholders show `—`); practice-feedback wording only (never "chứng chỉ", "chứng nhận", "certificate" except the existing negated disclaimer); no unreviewed clinical text presented as verified.
5. **No new npm dependencies.** Inline SVG icons (stroke, `aria-hidden="true"`).
6. **Quality floor:** 360px phone width with no horizontal scroll, visible focus, >= 44px touch targets, `aria-label` on icon-only buttons.

## Verify before your PR (from `apps/web` in your worktree)
`npm ci` (your worktree only; never touch the main checkout's `node_modules`), then `npx tsc --noEmit`, `npm run lint`, `npm run build`, all exit 0. Optional visual check: `npx next dev -p <your port>` and python Playwright screenshots at 360/768/1280 widths. Stop every process you start.

| Agent | next port | uvicorn port (if needed) | Docker Postgres (if needed) |
|---|---|---|---|
| L | 3021 | — | — |
| W | 3022 | 8022 | avp-s15w-pg / 55452 |
| D | 3023 | 8023 | avp-s15d-pg / 55453 |
| A | 3024 | 8024 | avp-s15a-pg / 55454 |

Use 127.0.0.1. Never connect to a Supabase database or create Supabase users. The human runs `npm run dev` on port 3000 and uvicorn on 8000 in the main checkout: never touch them or kill processes you did not start.

## Git
`git switch -c <branch> origin/feat/avp-125-slice15-design-foundation`, `git branch --unset-upstream`, then `PYTHONUTF8=1 python scripts/git_task.py preflight AVP-xxx` (must say READY or CONTINUE; on BLOCKED stop and report). Commit with `PYTHONUTF8=1 python scripts/git_task.py commit AVP-xxx -t feat -s web -m "<summary, subject <= 72 chars>"` (it stages everything: never leave stray files), then `PYTHONUTF8=1 python scripts/git_task.py push`, then `gh pr create --base main` (say "Depends on the AVP-125 foundation PR") with a Vietnamese+English summary, the checks you ran, and "Integration follow-ups". The PR body ends with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Never push to main, never force-push, never merge.
