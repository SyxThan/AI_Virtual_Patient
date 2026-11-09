# Delegating work to agy (Antigravity CLI)

Purpose: let Claude Code hand routine, well-specified tasks to `agy` so Claude's tokens go to the hard parts (guardrails, evaluator, architecture). This file explains setup, how the wrapper works, and when to stop delegating.

## One-time setup (human)
1. Install: `curl -fsSL https://antigravity.google/cli/install.sh | bash` (Linux/macOS; use the PowerShell installer on Windows). Check `agy --version`.
2. Sign in **interactively once** by running `agy` in a terminal. Headless runs fail with "authentication required" if no credentials are cached.
3. Set up git as in docs/git-workflow.md (task AVP-031). The wrapper uses git to see exactly which files agy touched, and refuses to run on `main`/`master` or on a branch that does not belong to the task.
4. Pre-grant only what tasks need. In headless mode a tool that needs approval and is not pre-granted is soft-denied (the run continues and exits 0). Add scoped rules under `permissions.allow` in `~/.gemini/antigravity-cli/settings.json` (the official docs show `command(git)` as an example; add other commands such as the test runner in the same pattern, and check `agy` docs for the exact syntax). Avoid `--dangerously-skip-permissions`.
5. `agy models` lists model slugs; pass one with `--model` if you want to pin it.

## How a delegation runs
`python scripts/agy_delegate.py AVP-xxx` does, in order:
1. Refuses if the brief is missing, the current branch is not `<type>/avp-xxx-*` (never `main`), the tree is dirty, or the brief lacks Allowed paths / Acceptance command. Run `python scripts/git_task.py preflight AVP-xxx` and `start` first.
2. Runs `agy` headless with JSON output, `--sandbox`, stdin closed, a hard timeout, the prompt as the last argument.
3. Requires a report at `.agy/reports/AVP-xxx.md` (a stale one is deleted first).
4. Fails with exit 2 if any changed file is outside `## Allowed paths`.
5. Runs the acceptance command itself and prints a short pass/fail summary.

| Exit | Meaning | Next step |
|---|---|---|
| 0 | agy done, scope ok, acceptance passed | Skim the report; then `git_task.py commit` and `push` (the lead commits, agy does not) |
| 1 | agy failed, timed out or left no report | Read `.agy/runs/AVP-xxx.err`; tighten brief; retry |
| 2 | files outside scope | `git diff`; revert strays; retry or take over |
| 3 | acceptance failed | Read the printed tail; retry once with the failure pasted into the brief |
| 4 | setup problem | Fix what the message says |

## Known agy quirks and how the wrapper handles them
Reported on the agy issue tracker (versions around 1.0.x to 1.1.x); verify against your installed version.
- `agy -p` can print nothing to stdout when not attached to a terminal, exit 0, and swallow server errors (for example quota exhaustion). The wrapper does not trust stdout or the exit code alone: it needs the report file.
- It can hang when stdin is an open pipe, and `--print-timeout` has not always stopped it. The wrapper closes stdin and enforces its own timeout.
- `-p` consumes the next token as its value, so the prompt is last.
- If stdout is empty but the work was done, the transcript is under `~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`.

## Writing a good brief
Copy `.agy/tasks/_TEMPLATE.md`. The test of a good brief: a competent stranger could do it without asking a question. Include signatures, error cases and the exact acceptance command. Keep it under ~40 lines. If the brief needs medical judgement, it is not delegable.

## Delegable vs not
| Delegate | Keep with Claude / humans |
|---|---|
| CRUD endpoints, DB models, repository classes | Patient / Evaluator / Debriefing prompts |
| Validation and conversion scripts, fixtures | Guardrail logic and its red-team prompts |
| Unit and integration test scaffolding | Database schema, Alembic migrations, RLS and grants, auth |
| API contract and architecture decisions |
| UI components from a written spec | Any clinical content or rubric wording |
| Provider adapters behind an existing interface | Secrets, auth, security |
| Benchmark and metric scripts | Interpreting evaluation results |

## Is it actually saving tokens?
Delegating costs Claude tokens too: writing the brief and reading the summary. It pays off only when the work is big relative to the brief and acceptance is automatic. Track it in `evals/results/delegation-log.csv` (task id, brief lines, exit code, retries, whether Claude had to rework). If two of the last three delegations needed rework, stop delegating that kind of task and tighten the briefs first. Code from agy is unreviewed: tests are the safety net, so tasks without tests are not delegable.
