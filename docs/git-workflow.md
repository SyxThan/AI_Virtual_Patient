# Git workflow (humans, Claude Code and agy)

One workflow for everyone. The helper `scripts/git_task.py` enforces the mechanical parts, so agents do not re-derive the rules each time.

## Principles
1. `main` is always green and is changed only by merged pull requests. Nobody commits or pushes to `main` directly.
2. One task = one branch = one pull request. The task id is in the branch name and in every commit subject.
3. Check git **before** writing any code, commit in small steps, and **push after every commit**: the cloud session's disk is temporary, so unpushed work can be lost.
4. History is never rewritten once pushed. No force-push.
5. When the state is surprising (dirty tree, diverged branch, conflicts), stop and ask the human. Do not stash, reset or discard to "get unstuck".

## Before starting any task (mandatory)
Run `python scripts/git_task.py preflight AVP-xxx`. It fetches `origin` and reports branch, cleanliness, ahead/behind, and whether the task's dependencies (from `docs/tasks.md`) have been merged (a merged dependency is a commit tagged `[T-yyy]` on `origin/main`; human tasks must be confirmed by a person).

| Verdict | Meaning | Do |
|---|---|---|
| `READY` | On an up-to-date, clean `main`; dependencies merged | `python scripts/git_task.py start AVP-xxx <slug> [--branch-type docs]` creates `<type>/avp-xxx-<slug>` |
| `CONTINUE` | Already on this task's branch | Carry on; uncommitted files are listed |
| `BLOCKED` | Dirty tree, unpushed commits on `main`, other task's branch, behind upstream, dependency not merged, no remote | Stop. Fix what it says or ask the human. Never discard someone's changes to unblock yourself |

Without the script: `git fetch origin --prune`, `git status`, `git branch --show-current`, `git log --oneline -5`, compare with `origin/main`, then `git switch -c <type>/avp-NNN-<slug>` from an up-to-date `main`.

## Branches
- Name: `<type>/avp-<number>-<slug>`, lowercase, type one of feat, fix, test, docs, chore (the workbook's branch types), for example `feat/avp-009-patient-guardrails`. `start` takes `--branch-type` (default feat). There is no `develop` branch; integration checkpoints run on a PR branch or `release/mvp-v0-1`. Non-task work: ask the human for a task id first (add it to `docs/tasks.md`).
- Created from the latest `origin/main`. Keep branches short-lived (days, not weeks); rebase on `origin/main` before opening the PR.

## Commits
Format: `type(scope): imperative summary [AVP-xxx]`, English, at most 72 characters in the subject. A body explains why, not what.

| Field | Allowed |
|---|---|
| type | `feat` `fix` `docs` `test` `refactor` `perf` `chore` `wip` |
| scope | `api` `web` `db` `data` `evals` `docs` `agents` `scripts` `repo` |

Rules:
- Commit through `python scripts/git_task.py commit AVP-xxx -t feat -s api -m "..."`. It refuses on `main` or on another task's branch, runs `make lint` and `make test` when those targets exist, blocks forbidden files, scans the staged diff for secrets, and builds the subject.
- One logical change per commit, tests in the same commit as the code, docs updated in the same commit when behaviour changes. Do not mix formatting-only changes with logic.
- `wip` commits are allowed on a task branch to save unfinished work (checks are skipped); the pull request is squash-merged, so they disappear from `main`.
- A commit that changes clinical content under `data/cases/` says in the body what changed and "review reset to draft".
- A migration commit uses scope `db` and states that RLS and revokes are included.
- Agent-authored commits carry the trailers the agent's environment requires, passed with `--trailer "Key: value"` (repeatable).
- Never commit: `.env` or `.env.*` (except `.env.example`), keys or tokens, `data/source/`, database dumps or SQLite files, audio or real student transcripts, `node_modules`, build output. A secret that was committed is treated as leaked: tell the human so it can be rotated; deleting the commit is not enough.

## Push
- `python scripts/git_task.py push` pushes the current task branch (sets upstream the first time). It refuses on `main`.
- Push after every commit. If rejected as non-fast-forward: `git pull --rebase`, rerun checks, push again. If conflicts appear, stop and ask.

## Pull requests and merging
- Open a PR from the task branch into `main`, titled `[AVP-xxx] short title`; at least one other team member reviews it (Definition of Done); fill in `.github/pull_request_template.md` (acceptance evidence, clinical content touched, migrations and RLS, delegated to agy, evaluation numbers).
- The PR is squash-merged by a human after the acceptance command passes. The squash message keeps `[AVP-xxx]`, because the next tasks' preflight finds merged dependencies by that tag.
- Clinical-content PRs (`data/cases/**`, rubrics, patient/evaluator prompts) need review from a second team member; a physician's review is tracked in the case JSON, not in the PR.

## Working with agy
- agy never runs state-changing git commands (commit, checkout, switch, reset, stash, push, merge, rebase). It edits files on the current task branch, and the wrapper requires that branch and a clean tree.
- Flow: `preflight` → `start` → write the brief → `python scripts/agy_delegate.py AVP-xxx` → read its summary → `git_task.py commit` → `git_task.py push`. Claude commits; agy does not.
- If a run breaks scope, revert only the files that run touched (listed by the wrapper), never the whole tree.

## Never (agents and humans)
Force-push, commit or push to `main`, `git reset --hard` or `git clean` on work you did not create in this task, `git stash` someone else's changes, amend or rebase pushed commits others may have pulled, skip hooks (`--no-verify`), change `git config`, rewrite history, add large binaries.

## One-time setup (task AVP-031, human)
1. Create the remote repository (private) and set `origin`; make the first commit containing this skeleton on `main` and push it.
2. Settings on the host: protect `main` (pull request required with at least 1 approving review, no force-push, no direct push), allow squash merge only, delete branches after merge.
3. Each person sets `git config user.name` and `user.email` once. Agents use the identity already configured for the session.
4. Optionally add CI later (run `make lint` and `make test`) and require it on `main`.

## Release branch
`release/mvp-v0-1` is cut from `main` on Day 29 for the release rehearsal; only fixes with an AVP id go in; Day 30 tags it. Branch protection applies to it as to `main`.
