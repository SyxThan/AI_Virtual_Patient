#!/usr/bin/env python3
"""Delegate one task brief to the Antigravity CLI (agy) and verify the result cheaply.

Usage:
  python scripts/agy_delegate.py AVP-012 [--effort low|medium|high] [--timeout 900]
                                       [--model SLUG] [--no-sandbox] [--allow-dirty]

Exit codes: 0 ok | 1 agy failed, timed out or left no report | 2 scope violation
            3 acceptance command failed | 4 setup problem

Design notes (see docs/agy-delegation.md):
- agy headless mode has known quirks (empty stdout when not on a TTY, hangs when stdin is
  open, --print-timeout not always honoured). So: stdin is closed, the timeout is enforced
  here, the prompt is the LAST argument, and success is judged by the report file, the scope
  check and the acceptance command, never by agy's exit code alone.
- Standard library only, so it runs the same on Windows, macOS and Linux.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGY_DIR = ROOT / ".agy"
TAIL_LINES = 25


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def section(text: str, title: str) -> str:
    m = re.search(rf"^##\s+{re.escape(title)}\s*\n(.*?)(?=^##\s|\Z)", text, re.S | re.M)
    return m.group(1) if m else ""


def allowed_patterns(brief: str) -> list[str]:
    return [ln[2:].strip().strip("`") for ln in section(brief, "Allowed paths").splitlines()
            if ln.startswith("- ") and ln[2:].strip()]


def acceptance_command(brief: str) -> str | None:
    for ln in section(brief, "Acceptance command").splitlines():
        ln = ln.strip()
        if not ln or ln.startswith("```"):
            continue
        return ln.strip("`").strip() or None
    return None


def in_scope(path: str, patterns: list[str]) -> bool:
    path = path.replace("\\", "/")
    for pat in patterns:
        pat = pat.replace("\\", "/")
        if pat.endswith("/**") or pat.endswith("/"):
            if path.startswith(pat.rstrip("*").rstrip("/") + "/"):
                return True
        elif fnmatch.fnmatch(path, pat):
            return True
    return False


def changed_files() -> list[str]:
    out = git("status", "--porcelain=v1", "-uall").stdout.splitlines()
    files = []
    for ln in out:
        p = ln[3:].split(" -> ")[-1].strip().strip('"')
        if p and not p.startswith(".agy/"):
            files.append(p)
    return sorted(set(files))


def tail(text: str, n: int = TAIL_LINES) -> str:
    return "\n".join(text.strip().splitlines()[-n:])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("task_id", help="e.g. AVP-012 (brief at .agy/tasks/AVP-012.md)")
    ap.add_argument("--effort", choices=["low", "medium", "high"], default="medium")
    ap.add_argument("--timeout", type=int, default=900, help="seconds for the agy run")
    ap.add_argument("--model", default=None, help="agy model slug (see `agy models`)")
    ap.add_argument("--no-sandbox", action="store_true", help="do not pass --sandbox to agy")
    ap.add_argument("--allow-dirty", action="store_true", help="skip the clean-working-tree check")
    args = ap.parse_args()

    tid = args.task_id
    brief_path = AGY_DIR / "tasks" / f"{tid}.md"
    report_path = AGY_DIR / "reports" / f"{tid}.md"
    runs = AGY_DIR / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    # ---- setup checks -------------------------------------------------------------------
    if not brief_path.exists():
        print(f"SETUP: brief not found: {brief_path}")
        return 4
    if git("rev-parse", "--is-inside-work-tree").returncode != 0:
        print("SETUP: not a git repository. Run `git init` and commit first; the scope check needs git.")
        return 4
    branch = git("branch", "--show-current").stdout.strip()
    btype, _, brest = branch.partition("/")
    if btype not in {"feat", "fix", "test", "docs", "chore"} or not brest.startswith(tid.lower() + "-"):
        print(f"SETUP: current branch is '{branch or 'detached HEAD'}', expected '<type>/{tid.lower()}-<slug>'. "
              f"Run `python scripts/git_task.py preflight {tid}` then `start {tid} <slug>` (never delegate on main).")
        return 4
    agy = shutil.which("agy")
    if not agy:
        print("SETUP: `agy` not found on PATH. Install it and sign in once interactively (docs/agy-delegation.md).")
        return 4
    brief = brief_path.read_text(encoding="utf-8")
    patterns = allowed_patterns(brief)
    acceptance = acceptance_command(brief)
    if not patterns or not acceptance:
        print("SETUP: brief needs a non-empty '## Allowed paths' list and a '## Acceptance command'.")
        return 4
    if not args.allow_dirty and changed_files():
        print("SETUP: working tree has uncommitted changes outside .agy/. Commit them (git_task.py commit) first; do not stash:")
        print("  " + "\n  ".join(changed_files()[:10]))
        return 4

    # ---- run agy -----------------------------------------------------------------------
    report_path.unlink(missing_ok=True)  # never accept a stale report
    prompt = (
        f"Read AGENTS.md, then do the task in .agy/tasks/{tid}.md and nothing else. "
        f"Edit only the paths under '## Allowed paths'. Run the acceptance command and fix failures. "
        f"When finished, write your report to .agy/reports/{tid}.md using the headings in AGENTS.md. "
        f"Do not commit."
    )
    cmd = [agy, "--output-format", "json", "--effort", args.effort]
    if not args.no_sandbox:
        cmd.append("--sandbox")
    if args.model:
        cmd += ["--model", args.model]
    cmd += ["-p", prompt]  # prompt must be last: -p consumes the next token

    try:
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                              stdin=subprocess.DEVNULL, timeout=args.timeout)
    except subprocess.TimeoutExpired:
        print(f"AGY: timed out after {args.timeout}s (enforced by this script).")
        return 1
    (runs / f"{tid}.json").write_text(proc.stdout or "", encoding="utf-8")
    (runs / f"{tid}.err").write_text(proc.stderr or "", encoding="utf-8")

    status = None
    try:
        status = json.loads(proc.stdout).get("status")
    except (json.JSONDecodeError, AttributeError, TypeError):
        pass

    problems: list[str] = []
    if proc.returncode != 0:
        problems.append(f"agy exit code {proc.returncode}")
    if status is not None and status != "SUCCESS":
        problems.append(f"agy status {status}")
    if status is None and not report_path.exists():
        problems.append("agy produced no parseable output and no report (known silent-output bug?)")
    if not report_path.exists():
        problems.append("no report written")
    if problems:
        print("AGY FAILED: " + "; ".join(problems))
        if proc.stderr.strip():
            print("stderr tail:\n" + tail(proc.stderr, 10))
        return 1

    # ---- scope check -------------------------------------------------------------------
    touched = changed_files()
    outside = [f for f in touched if not in_scope(f, patterns)]
    if outside:
        print("SCOPE VIOLATION: files changed outside Allowed paths:")
        print("  " + "\n  ".join(outside))
        print("Review with `git diff`, revert them (git checkout -- <file> / delete new files), then retry or take over.")
        return 2

    # ---- acceptance --------------------------------------------------------------------
    acc = subprocess.run(acceptance, cwd=ROOT, shell=True, capture_output=True, text=True)
    print(f"task: {tid} | agy status: {status or 'n/a (report present)'} | files changed: {len(touched)}")
    for f in touched:
        print(f"  {f}")
    print(f"report: .agy/reports/{tid}.md")
    if acc.returncode != 0:
        print(f"ACCEPTANCE FAILED (exit {acc.returncode}): {acceptance}")
        print(tail(acc.stdout + "\n" + acc.stderr))
        return 3
    print(f"ACCEPTANCE PASSED: {acceptance}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
