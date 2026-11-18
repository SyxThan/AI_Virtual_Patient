"""Collect the latest REAL eval results into the web transparency page (AVP-139).

Reads evals/results/*.json and writes apps/web/src/data/evals-summary.json, which
the /minh-bach page renders at build time. Rules (Hard rule 3):
  - a result measured with any fake provider is never published;
  - for each metric only the most recent real result is used, with its date,
    commit and model names next to the numbers;
  - the judge's "unsupported per 100 turns" is published only once a human audit
    of that judge run is complete (redteam-audit-score with complete = true);
  - a metric with no real result is null, and the page says "not measured yet".

Usage (from the repo root): python evals/publish_summary.py [--results DIR] [--out FILE]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

OUT_FILE = common.REPO_ROOT / "apps" / "web" / "src" / "data" / "evals-summary.json"


def _load(results: Path, prefix: str) -> list[tuple[Path, dict]]:
    out = []
    for p in sorted(results.glob(f"{prefix}*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if data.get("contains_fake_provider") is not False:
            continue  # fake or unknown provenance: never published
        out.append((p, data))
    return out


def _latest(items: list[tuple[Path, dict]]) -> tuple[Path, dict] | None:
    return max(items, key=lambda x: x[1].get("measured_at") or "") if items else None


def _meta(path: Path, data: dict) -> dict:
    return {
        "source": f"evals/results/{path.name}",
        "measured_at": data.get("measured_at"),
        "git_commit": data.get("git_commit"),
    }


def latency(results: Path, mode: str) -> dict | None:
    hit = _latest(_load(results, f"latency-{mode}-"))
    if not hit:
        return None
    path, d = hit
    s = d["summary_ms"]
    return {
        **_meta(path, d),
        "providers": d["config"]["provider_names"],
        "setup": d["config"]["setup"],
        "turns": d["turns_total"],
        "turns_with_errors": d["turns_with_errors"],
        "first_audio_p50": s["first_audio_ms"]["p50"],
        "first_audio_p95": s["first_audio_ms"]["p95"],
        "first_text_p50": s["first_text_ms"]["p50"],
        "stt_p50": s["stt_ms"]["p50"],
        "llm_p50": s["llm_ms"]["p50"],
        "tts_p50": s["tts_ms"]["p50"],
        "target_ms": d["target"]["target_ms"],
        "target_met": d["target"]["met"],
    }


def repeatability(results: Path) -> dict | None:
    hit = _latest(_load(results, "repeatability-"))
    if not hit:
        return None
    path, d = hit
    s = d["summary"]
    return {
        **_meta(path, d),
        "models": d["config"]["evaluator_models"],
        "runs_per_transcript": d["config"]["runs_per_transcript"],
        "transcripts": len(d["config"]["transcripts"]),
        "criterion_cells": s["criterion_cells"],
        "identical_all_runs_rate": s["identical_all_runs_rate"],
        "mean_modal_agreement": s["mean_modal_agreement"],
        "max_total_score_range": s["max_total_score_range"],
    }


def _case_title(case_id: str) -> str:
    """Vietnamese case title from data/cases/<id>.json; the id itself if unreadable."""
    try:
        data = json.loads((common.REPO_ROOT / "data" / "cases" / f"{case_id}.json").read_text("utf-8"))
        return data["title"]["vi"]
    except (OSError, ValueError, KeyError, TypeError):
        return case_id


def redteam(results: Path) -> dict | None:
    """All cases: the latest real run per case, summed (AVP-170)."""
    per_case: dict[str, tuple[Path, dict]] = {}
    for p, d in _load(results, "redteam-case-"):
        cid = d.get("config", {}).get("case_id") or p.stem
        if cid not in per_case or (d.get("measured_at") or "") > (
            per_case[cid][1].get("measured_at") or ""
        ):
            per_case[cid] = (p, d)
    if not per_case:
        return None
    runs = [per_case[k] for k in sorted(per_case)]
    newest_path, newest = max(runs, key=lambda x: x[1].get("measured_at") or "")
    by_category: dict[str, dict[str, int]] = {}
    for _, d in runs:
        for cat, v in d["by_category"].items():
            agg = by_category.setdefault(cat, {"n": 0, "passed": 0})
            agg["n"] += v["n"] - v["errors"]
            agg["passed"] += v["passed"]
    completed = sum(d["summary"]["completed"] for _, d in runs)
    passed = sum(d["summary"]["passed"] for _, d in runs)
    return {
        **_meta(newest_path, newest),
        "sources": [f"evals/results/{p.name}" for p, _ in runs],
        "first_measured_at": min((d.get("measured_at") or "") for _, d in runs) or None,
        "model": ", ".join(sorted({d["config"]["patient_model"] for _, d in runs})),
        "prompts": sum(d["summary"]["prompts"] for _, d in runs),
        # Prompts with no reply (provider error, e.g. rate limit): not graded, shown on the page.
        "errors": sum(d["summary"]["prompts"] - d["summary"]["completed"] for _, d in runs),
        "completed": completed,
        "passed": passed,
        "pass_rate": round(passed / completed, 3) if completed else None,
        "by_category": by_category,
        "cases": [
            {
                "case_id": d["config"]["case_id"],
                "title": _case_title(d["config"]["case_id"]),
                "prompts": d["summary"]["prompts"],
                "errors": d["summary"]["prompts"] - d["summary"]["completed"],
                "completed": d["summary"]["completed"],
                "passed": d["summary"]["passed"],
                "pass_rate": d["summary"]["pass_rate"],
            }
            for _, d in runs
        ],
    }


def judge(results: Path) -> dict | None:
    """Latest judged run whose audit sample a human has fully labelled."""
    scores = {}
    for p in sorted(results.glob("redteam-audit-score-*.json")):
        try:
            sc = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if sc.get("summary", {}).get("complete"):
            csv_name = sc["config"]["audit_csv"]  # redteam-audit-<ts>.csv
            scores[csv_name.removeprefix("redteam-audit-").removesuffix(".csv")] = sc
    audited = []
    for p, d in _load(results, "redteam-judged-"):
        stamp = p.stem.removeprefix("redteam-judged-")
        if stamp in scores:
            audited.append((p, d, scores[stamp]))
    if not audited:
        return None
    path, d, sc = max(audited, key=lambda x: x[1].get("measured_at") or "")
    s, a = d["summary"], sc["summary"]
    return {
        **_meta(path, d),
        "patient_model": d["config"]["patient_model"],
        "judge_model": d["config"]["judge_model"],
        "judged": s["judged"],
        "unsupported_per_100": s["unsupported_per_100"],
        "gated_leaks_per_100": s["gated_leaks_per_100"],
        "audit_labelled": a["human_labelled"],
        "audit_agreement": a["label_agreement"],
        "audit_missed_unsupported": a["judge_missed_unsupported"],
    }


def build(results: Path) -> dict:
    return {
        "generated_by": "evals/publish_summary.py",
        "latency": {"voice": latency(results, "voice"), "text": latency(results, "text")},
        "repeatability": repeatability(results),
        "redteam": redteam(results),
        "judge": judge(results),
    }


def main(argv: list[str] | None = None) -> Path:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--results", type=Path, default=common.RESULTS_DIR)
    ap.add_argument("--out", type=Path, default=OUT_FILE)
    args = ap.parse_args(argv)
    summary = build(args.results)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
    args.out.write_text(text, encoding="utf-8")
    published = [k for k, v in summary.items() if isinstance(v, dict) and any(v.values())]
    print(f"published: {', '.join(published) or 'nothing (no real results yet)'} -> {args.out}")
    return args.out


if __name__ == "__main__":
    main()
