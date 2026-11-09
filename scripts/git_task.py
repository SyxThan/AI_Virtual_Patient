#!/usr/bin/env python3
"""Git guard rails for task work (standard library only). Rules: docs/git-workflow.md.

  python scripts/git_task.py preflight AVP-012
  python scripts/git_task.py start AVP-012 patient-guardrails [--branch-type feat|fix|test|docs|chore]
  python scripts/git_task.py commit AVP-012 -t feat -s api -m "add guardrail checks" [-b BODY] [--trailer "Key: value"]... [--no-checks]
  python scripts/git_task.py push

Exit codes: 0 ok | 1 blocked or refused | 2 unsafe content (secrets, forbidden files) | 4 usage or setup problem
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROTECTED = {"main", "master"}
BRANCH_TYPES = {"feat", "fix", "test", "docs", "chore"}
TYPES = {"feat", "fix", "docs", "test", "refactor", "perf", "chore", "wip"}
SCOPES = {"api", "web", "db", "data", "evals", "docs", "agents", "scripts", "repo"}
NO_CHECK_TYPES = {"docs", "chore", "wip"}
FORBIDDEN_PATHS = [r"^data/source/", r"\.(pem|key|p12|pfx|sqlite3?|dump)$", r"^\.agy/runs/", r"(^|/)node_modules/", r"(^|/)\.next/"]
SECRET_PATTERNS = {
    "Google API key": r"AIza[0-9A-Za-z_\-]{35}",
    "API key (sk-...)": r"\bsk-[A-Za-z0-9_\-]{20,}",
    "private key block": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "JWT": r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}",
    "database URL with password": r"postgres(?:ql)?(?:\+\w+)?://[^:\s/]+:[^@\s<>$]{3,}@",
}


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def out(*args: str) -> str:
    return git(*args).stdout.strip()


def current_branch() -> str:
    return out("branch", "--show-current")


def changed_paths() -> list[str]:
    paths = []
    for ln in git("status", "--porcelain=v1", "-uall").stdout.splitlines():
        p = ln[3:].split(" -> ")[-1].strip().strip('"')
        if p:
            paths.append(p)
    return paths


def counts(left: str, right: str) -> tuple[int, int]:
    """(commits only in left, commits only in right)."""
    r = git("rev-list", "--left-right", "--count", f"{left}...{right}")
    a, b = r.stdout.split() if r.returncode == 0 and r.stdout.split() else ("0", "0")
    return int(a), int(b)


def base_branch() -> str | None:
    for name in ("main", "master"):
        if git("rev-parse", "--verify", "--quiet", f"refs/remotes/origin/{name}").returncode == 0:
            return name
    return None


def task_row(tid: str) -> dict | None:
    p = ROOT / "docs" / "tasks.md"
    if not p.exists():
        return None
    header: list[str] = []
    for ln in p.read_text(encoding="utf-8").splitlines():
        if not ln.strip().startswith("|"):
            continue
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if cells and cells[0] == "ID":
            header = [c.lower() for c in cells]
            continue
        if cells and cells[0] == tid and "owner" in header and "depends" in header:
            return {"owner": cells[header.index("owner")],
                    "deps": re.findall(r"AVP-\d{3}", cells[header.index("depends")])}
    return None


def is_task_branch(branch: str, tid: str) -> bool:
    """Task branches look like <type>/avp-012-slug."""
    typ, _, rest = branch.partition("/")
    return typ in BRANCH_TYPES and rest.startswith(tid.lower() + "-")


def merged_into_base(tid: str, base: str) -> bool:
    return bool(out("log", f"origin/{base}", "--fixed-strings", f"--grep=[{tid}]", "-1", "--format=%h"))


def preflight(tid: str) -> tuple[str, list[str]]:
    """Returns (verdict, lines). Verdict: READY (on main, may branch), CONTINUE (on this task's branch), BLOCKED."""
    lines: list[str] = []
    blocked: list[str] = []
    if git("rev-parse", "--is-inside-work-tree").returncode != 0:
        return "BLOCKED", ["not a git repository: run `git init`, add a remote, make the first commit (task AVP-031)"]
    if not out("remote"):
        return "BLOCKED", ["no remote configured: add `origin` (task AVP-031)"]
    f = git("fetch", "origin", "--prune")
    if f.returncode != 0:
        return "BLOCKED", ["git fetch failed: " + (f.stderr.strip().splitlines() or ["unknown error"])[-1]]
    base = base_branch()
    if not base:
        return "BLOCKED", ["origin has no main/master branch yet: push the initial commit first (task AVP-031)"]
    cur = current_branch()
    files = changed_paths()
    on_task_branch = is_task_branch(cur, tid)

    if not cur:
        blocked.append("detached HEAD: switch to a branch")
    elif cur in PROTECTED:
        ahead, behind = counts(cur, f"origin/{cur}") if git("rev-parse", "--verify", "--quiet", f"origin/{cur}").returncode == 0 else (0, 0)
        lines.append(f"branch: {cur} | {'clean' if not files else str(len(files)) + ' changed file(s)'} | ahead {ahead}, behind {behind} vs origin/{cur}")
        if files:
            blocked.append("working tree is not clean on " + cur + ": " + ", ".join(files[:8]) + " (do not stash/discard without the human's OK)")
        if ahead:
            blocked.append(f"{cur} has {ahead} unpushed commit(s): commits on {cur} are not allowed; move them to a task branch")
    elif on_task_branch:
        up = git("rev-parse", "--abbrev-ref", "@{u}")
        ahead = behind = 0
        if up.returncode == 0:
            ahead, behind = counts("HEAD", "@{u}")
        b_ahead, b_behind = counts("HEAD", f"origin/{base}")
        lines.append(f"branch: {cur} (this task) | {'clean' if not files else str(len(files)) + ' uncommitted file(s)'} | "
                     f"{'upstream: ahead ' + str(ahead) + ', behind ' + str(behind) if up.returncode == 0 else 'not pushed yet'} | {b_behind} commit(s) behind origin/{base}")
        if behind:
            blocked.append(f"{cur} is {behind} commit(s) behind its upstream: run `git pull --rebase`")
    else:
        blocked.append(f"on branch '{cur}', which is not a branch of {tid}: finish and push it, or switch deliberately")

    row = task_row(tid)
    if row is None:
        lines.append(f"note: {tid} not found in docs/tasks.md")
    else:
        dep_notes = []
        for d in row["deps"]:
            drow = task_row(d)
            if drow and drow["owner"].upper().startswith("H"):
                dep_notes.append(f"{d} (human task: confirm it is done)")
            elif merged_into_base(d, base):
                dep_notes.append(f"{d} merged")
            else:
                dep_notes.append(f"{d} NOT merged")
                blocked.append(f"dependency {d} has no commit tagged [{d}] on origin/{base}")
        lines.append("deps: " + (", ".join(dep_notes) if dep_notes else "none"))

    if blocked:
        return "BLOCKED", lines + ["- " + b for b in blocked]
    return ("CONTINUE" if on_task_branch else "READY"), lines


def cmd_preflight(a) -> int:
    verdict, lines = preflight(a.task_id)
    print("\n".join(lines))
    hint = {"READY": f"-> next: python scripts/git_task.py start {a.task_id} <short-slug>",
            "CONTINUE": "-> continue on this branch",
            "BLOCKED": "-> stop and resolve the points above (ask the human if unsure)"}[verdict]
    print(f"VERDICT: {verdict} {hint}")
    return 0 if verdict != "BLOCKED" else 1


def cmd_start(a) -> int:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,40}", a.slug):
        print("slug must be 3-41 chars of a-z, 0-9 and '-'")
        return 4
    verdict, lines = preflight(a.task_id)
    if verdict != "READY":
        print("\n".join(lines) + f"\nVERDICT: {verdict}: cannot start")
        return 1
    base = base_branch()
    cur = current_branch()
    if counts(cur, f"origin/{cur}")[1]:
        r = git("pull", "--ff-only", "origin", cur)
        if r.returncode != 0:
            print("fast-forward pull failed: " + r.stderr.strip()[-300:])
            return 1
    name = f"{a.branch_type}/{a.task_id.lower()}-{a.slug}"
    r = git("switch", "-c", name)
    if r.returncode != 0:
        print(r.stderr.strip())
        return 1
    print("\n".join(lines))
    print(f"started {name} from {cur} (base origin/{base})")
    return 0


def secret_scan_staged() -> list[str]:
    findings, path = [], "?"
    for ln in git("diff", "--cached", "-U0", "--no-color").stdout.splitlines():
        if ln.startswith("+++ b/"):
            path = ln[6:]
        elif ln.startswith("+") and not ln.startswith("+++"):
            for kind, pat in SECRET_PATTERNS.items():
                if re.search(pat, ln):
                    findings.append(f"{path}: looks like a {kind}")
    return sorted(set(findings))


def forbidden(paths: list[str]) -> list[str]:
    bad = []
    for p in paths:
        name = p.rsplit("/", 1)[-1]
        if name == ".env" or (name.startswith(".env.") and name != ".env.example"):
            bad.append(p)
        elif any(re.search(pat, p) for pat in FORBIDDEN_PATHS):
            bad.append(p)
    return bad


def make_target_exists(target: str) -> bool:
    return bool(shutil.which("make")) and (ROOT / "Makefile").exists() and \
        subprocess.run(["make", "-n", target], cwd=ROOT, capture_output=True).returncode == 0


def cmd_commit(a) -> int:
    cur = current_branch()
    if cur in PROTECTED or not is_task_branch(cur, a.task_id):
        print(f"refused: branch '{cur or 'detached'}' is not a branch of {a.task_id} (commits on main are never allowed)")
        return 1
    if a.type not in TYPES or a.scope not in SCOPES:
        print(f"type must be one of {sorted(TYPES)}; scope one of {sorted(SCOPES)}")
        return 4
    subject = f"{a.type}({a.scope}): {a.message} [{a.task_id}]"
    if len(subject) > 72:
        print(f"subject is {len(subject)} chars (max 72): shorten it, put detail in --body")
        return 4
    for t in a.trailer or []:
        if not re.fullmatch(r"[A-Za-z][A-Za-z-]*: .+", t):
            print(f"bad trailer '{t}': use 'Key: value'")
            return 4
    paths = changed_paths()
    if not paths:
        print("nothing to commit")
        return 1
    bad = forbidden(paths)
    if bad:
        print("refused: files that must never be committed:\n  " + "\n  ".join(bad))
        return 2
    if not a.no_checks and a.type not in NO_CHECK_TYPES:
        for target in ("lint", "test"):
            if make_target_exists(target):
                r = subprocess.run(["make", target], cwd=ROOT, capture_output=True, text=True)
                if r.returncode != 0:
                    print(f"refused: `make {target}` failed:\n" + "\n".join((r.stdout + r.stderr).strip().splitlines()[-20:]))
                    return 1
    elif a.no_checks and a.type not in NO_CHECK_TYPES:
        print(f"refused: --no-checks is only allowed for types {sorted(NO_CHECK_TYPES)}")
        return 1
    git("add", "-A")
    findings = secret_scan_staged()
    if findings:
        git("reset", "-q")
        print("refused: possible secrets in the staged changes (nothing committed, changes left unstaged):\n  " + "\n  ".join(findings))
        return 2
    msg = subject + (f"\n\n{a.body}" if a.body else "") + ("\n\n" + "\n".join(a.trailer) if a.trailer else "")
    r = git("commit", "-q", "-m", msg)
    if r.returncode != 0:
        print("commit failed: " + (r.stderr or r.stdout).strip()[-300:])
        return 1
    print(f"committed {out('rev-parse', '--short', 'HEAD')} on {cur}: {subject}")
    return 0


def cmd_push(_a) -> int:
    cur = current_branch()
    if not cur or cur in PROTECTED:
        print(f"refused: never push from '{cur or 'detached HEAD'}' with this tool; work on a task branch")
        return 1
    has_up = git("rev-parse", "--abbrev-ref", "@{u}").returncode == 0
    r = git(*(["push"] if has_up else ["push", "-u", "origin", "HEAD"]))
    if r.returncode != 0:
        print("push failed (never force-push): " + (r.stderr.strip().splitlines() or ["?"])[-1])
        print("If rejected as non-fast-forward: `git pull --rebase`, rerun checks, push again; if conflicts, stop and ask the human.")
        return 1
    print(f"pushed {cur}. Open a pull request into main; the human merges.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("preflight", "start", "commit"):
        p = sub.add_parser(name)
        p.add_argument("task_id")
        if name == "start":
            p.add_argument("slug")
            p.add_argument("--branch-type", default="feat", choices=sorted(BRANCH_TYPES))
        if name == "commit":
            p.add_argument("-t", "--type", required=True)
            p.add_argument("-s", "--scope", required=True)
            p.add_argument("-m", "--message", required=True)
            p.add_argument("-b", "--body", default=None)
            p.add_argument("--trailer", action="append")
            p.add_argument("--no-checks", action="store_true")
    sub.add_parser("push")
    a = ap.parse_args()
    if hasattr(a, "task_id") and not re.fullmatch(r"AVP-\d{3}", a.task_id):
        print("task id must look like AVP-012")
        return 4
    return {"preflight": cmd_preflight, "start": cmd_start, "commit": cmd_commit, "push": cmd_push}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
