"""Evaluator repeatability: score the same transcript K times (AVP-117, TASK-S14-03).

The Evaluator LLM proposes a level per rubric criterion; code verifies evidence
and computes the score (Hard rule 4). An LLM at low temperature can still give
different levels on identical input. This script measures how often it does:

  per criterion: share of runs that agree with the most common level
  per transcript: spread (max - min) of the code-computed total score
  overall: share of (transcript, criterion) cells identical in every run

Repeatability is not validity: a stable evaluator can be stably wrong. Agreement
with instructors (Cohen's kappa) needs human labels and is a separate script.

Usage (from the repo root):
  python evals/repeatability.py                      # fake evaluator, CI smoke
  python evals/repeatability.py --providers env --runs 5
Transcripts: evals/fixtures/repeatability_transcripts.json (synthetic). Output
stores levels, statuses and scores only, never transcript text or feedback.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

common.use_api_package()

CASE_PATH = common.REPO_ROOT / "data" / "cases" / "case-01-hfmd.json"
FIXTURES = common.REPO_ROOT / "evals" / "fixtures" / "repeatability_transcripts.json"


def build_turns(spec: list[dict], case: dict) -> list:
    """Resolve fixture turns into TurnRecords. Patient text comes only from the case."""
    from avp_api.db.repositories.turn_repo import TurnRecord

    topics = {h["topic"]: h["lay_response"] for h in case.get("history", [])}
    fallbacks = case.get("fallback_lines", {})
    now = dt.datetime.now(dt.UTC)
    turns = []
    for idx, t in enumerate(spec):
        if "topic" in t:
            text = topics[t["topic"]]
        elif "fallback" in t:
            text = fallbacks[t["fallback"]][0]
        else:
            text = t["text"]
        turns.append(
            TurnRecord(
                id=idx + 1,
                session_id="eval-repeatability",
                idx=idx,
                speaker=t["speaker"],
                text=text,
                t_start_ms=idx * 10_000,
                created_at=now,
            )
        )
    return turns


def _provider(kind: str):
    from avp_api.providers.llm import FakeLLMProvider, get_evaluator_provider

    return FakeLLMProvider() if kind == "fake" else get_evaluator_provider()


def _level_key(level: int | None) -> str:
    return "null" if level is None else str(level)


def run(providers: str, runs: int, only: list[str] | None = None) -> dict:
    from avp_api.services.evaluator_agent import EvaluatorError, evaluate_transcript

    case = json.loads(CASE_PATH.read_text(encoding="utf-8"))
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    if fixtures["case_id"] != case["id"]:
        raise SystemExit("fixtures are for a different case")
    criteria = [c["id"] for c in case["rubric"]["items"]]
    provider = _provider(providers)

    models: set[str] = set()
    prompt_versions: set[str] = set()
    eval_ms: list[float] = []
    per_transcript = []
    all_cells: list[dict] = []
    for tr in fixtures["transcripts"]:
        if only and tr["id"] not in only:
            continue
        turns = build_turns(tr["turns"], case)
        levels: dict[str, list[str]] = {c: [] for c in criteria}
        statuses: dict[str, list[str]] = {c: [] for c in criteria}
        totals: list[float] = []
        critical: list[bool] = []
        errors: Counter[str] = Counter()
        for _ in range(runs):
            t0 = time.perf_counter()
            try:
                out = evaluate_transcript(case, turns, provider)
            except EvaluatorError as exc:
                errors[exc.code] += 1
                continue
            finally:
                eval_ms.append(int((time.perf_counter() - t0) * 1000))
            models.add(out.model)
            prompt_versions.add(out.prompt_version)
            for item in out.items:
                levels[item.criterion_id].append(_level_key(item.level))
                statuses[item.criterion_id].append(str(item.status))
            totals.append(out.score.total_score)
            critical.append(out.score.critical_missed)

        cells = []
        for c in criteria:
            seen = levels[c]
            if not seen:
                cells.append({"criterion_id": c, "n": 0})
                continue
            mode, mode_n = Counter(seen).most_common(1)[0]
            cell = {
                "criterion_id": c,
                "n": len(seen),
                "levels": dict(Counter(seen)),
                "statuses": dict(Counter(statuses[c])),
                "modal_level": mode,
                "modal_agreement": round(mode_n / len(seen), 3),
                "identical_all_runs": mode_n == len(seen),
            }
            cells.append(cell)
            all_cells.append(cell)
        per_transcript.append(
            {
                "transcript_id": tr["id"],
                "successful_runs": len(totals),
                "error_counts": dict(errors),
                "total_score": {
                    **common.summarize(totals),
                    "range": (max(totals) - min(totals)) if totals else None,
                },
                "critical_missed_runs": sum(critical),
                "criteria": cells,
            }
        )

    scored = [c for c in all_cells if c["n"]]
    ranges = [
        t["total_score"]["range"] for t in per_transcript if t["total_score"]["range"] is not None
    ]
    model_names = sorted(models)
    fake = providers == "fake" or any("fake" in m.lower() for m in model_names)
    return {
        **common.run_metadata("evals/repeatability.py"),
        "config": {
            "providers": providers,
            "evaluator_models": model_names,
            "prompt_versions": sorted(prompt_versions),
            "runs_per_transcript": runs,
            "transcripts": [t["transcript_id"] for t in per_transcript],
            "fixtures": "evals/fixtures/repeatability_transcripts.json (synthetic)",
            "case_id": case["id"],
            "rubric_version": int(case["rubric"].get("version", 1)),
            "case_review_status": case.get("review", {}).get("status"),
        },
        "contains_fake_provider": fake,
        "note": (
            "Fake evaluator (deterministic heuristic): numbers test the script only."
            if fake
            else "Real evaluator as configured in .env. Repeatability only, not validity."
        ),
        "summary": {
            "criterion_cells": len(scored),
            "identical_all_runs_rate": (
                round(sum(c["identical_all_runs"] for c in scored) / len(scored), 3)
                if scored
                else None
            ),
            "mean_modal_agreement": (
                round(sum(c["modal_agreement"] for c in scored) / len(scored), 3)
                if scored
                else None
            ),
            "max_total_score_range": max(ranges) if ranges else None,
            "evaluator_ms": common.summarize(eval_ms),
        },
        "transcripts": per_transcript,
    }


def main(argv: list[str] | None = None, out_dir: Path | None = None) -> Path:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--providers", choices=["fake", "env"], default="fake")
    ap.add_argument("--runs", type=int, default=5, help="evaluations per transcript")
    ap.add_argument("--only", nargs="*", default=None, help="transcript ids to run")
    ap.add_argument("--out", type=Path, default=None, help="default: evals/results/")
    args = ap.parse_args(argv)
    if args.runs < 2:
        ap.error("--runs must be >= 2 to measure repeatability")

    target = (args.out or out_dir or common.RESULTS_DIR).resolve()
    os.chdir(common.API_DIR)  # read .env exactly like the API server does
    result = run(args.providers, args.runs, args.only)
    path = common.write_result("repeatability", result, target)
    s = result["summary"]
    print(
        f"cells={s['criterion_cells']} identical={s['identical_all_runs_rate']} "
        f"mean_agreement={s['mean_modal_agreement']} "
        f"max_score_range={s['max_total_score_range']} "
        f"(fake={result['contains_fake_provider']}) -> {path}"
    )
    return path


if __name__ == "__main__":
    main()
