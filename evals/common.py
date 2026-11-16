"""Shared helpers for evals/ scripts (AVP-026).

Hard rule 3: numbers quoted anywhere in the project come only from files these
scripts write to evals/results/. Helpers here keep that output honest: every
result carries when, on which commit and with which providers it was measured.
"""

from __future__ import annotations

import datetime as dt
import json
import math
import platform
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "apps" / "api"
RESULTS_DIR = REPO_ROOT / "evals" / "results"


def use_api_package() -> None:
    """Make `import avp_api` work when a script runs from the repo root."""
    if str(API_DIR) not in sys.path:
        sys.path.insert(0, str(API_DIR))


def percentile(values: list[float], p: float) -> float | None:
    """Nearest-rank percentile (no interpolation): always a value that was observed."""
    if not values:
        return None
    if not 0 < p <= 100:
        raise ValueError("p must be in (0, 100]")
    ordered = sorted(values)
    rank = math.ceil(p / 100 * len(ordered))
    return ordered[rank - 1]


def summarize(values: list[float]) -> dict:
    """n, min, p50, p95, max, mean of the observed values (None when n == 0)."""
    if not values:
        return {"n": 0, "min": None, "p50": None, "p95": None, "max": None, "mean": None}
    return {
        "n": len(values),
        "min": min(values),
        "p50": percentile(values, 50),
        "p95": percentile(values, 95),
        "max": max(values),
        "mean": round(sum(values) / len(values), 1),
    }


def git_commit() -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except OSError:
        return None
    return out.stdout.strip() or None


def run_metadata(script: str) -> dict:
    return {
        "script": script,
        "measured_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "git_commit": git_commit(),
        "python": platform.python_version(),
        "platform": platform.platform(terse=True),
    }


def write_result(name: str, payload: dict, out_dir: Path | None = None) -> Path:
    """Write `<name>-<UTC timestamp>.json` and return its path."""
    target = out_dir or RESULTS_DIR
    target.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
    path = target / f"{name}-{stamp}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path
