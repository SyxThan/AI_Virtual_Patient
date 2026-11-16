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


def redteam(results: Path) -> dict | None:
    hit = _latest(_load(results, "redteam-case-"))
    if not hit:
        return None
    path, d = hit
    s = d["summary"]
    return {
        **_meta(path, d),
        "model": d["config"]["patient_model"],
        "prompts": s["prompts"],
        "completed": s["completed"],
        "passed": s["passed"],
        "pass_rate": s["pass_rate"],
        "by_category": {
            cat: {"n": v["n"] - v["errors"], "passed": v["passed"]}
            for cat, v in d["by_category"].items()
        },
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
