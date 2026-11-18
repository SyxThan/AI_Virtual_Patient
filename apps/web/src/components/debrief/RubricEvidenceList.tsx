"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import vi from "../../../messages/vi.json";
import Badge from "@/components/ui/Badge";
import Tile from "@/components/ui/Tile";
import { FOCUS_RING } from "@/components/ui/focus";
import type { Evaluation } from "@/hooks/useDebriefData";
import { fmt } from "@/lib/sessionAuth";
import { ClaimRow } from "./CitedClaimsSection";
import StatusIcon from "./StatusIcon";
import {
  countByFilter,
  criterionAnchor,
  defaultFilter,
  groupByDomain,
  isCriticalMiss,
  matchesFilter,
  type Claim,
  type Criterion,
  type ResultFilter,
} from "./debriefHelpers";
import { statusLabel, statusTone } from "./statusStyle";

const DOMAIN_LABEL = vi.debrief.domains as Record<string, string>;
const FILTERS: ResultFilter[] = ["missed", "all", "met"];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function EvidenceQuotes({ c, onOpenTurn }: { c: Criterion; onOpenTurn: (turnIdx: number) => void }) {
  if (c.evidence.length === 0) {
    return <p className="mt-1.5 text-sm italic text-ink-muted">{vi.debrief.rubric.noEvidence}</p>;
  }
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {c.evidence.map((e) => (
        <li key={`${e.turn_idx}-${e.quote}`}>
          <button
            type="button"
            onClick={() => onOpenTurn(e.turn_idx)}
            className={`group flex min-h-11 w-full flex-col gap-1.5 rounded-control border-l-4 border-primary bg-primary-soft/60 px-3 py-2.5 text-left text-sm text-ink hover:bg-primary-soft ${FOCUS_RING}`}
          >
            <span className="leading-relaxed">“{e.quote}”</span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-primary-strong">
              <span className="tabular">{fmt(vi.debrief.rubric.turn, { idx: e.turn_idx })}</span>
              <span className="underline-offset-2 group-hover:underline">{vi.debrief.rubric.openTranscript}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CriterionRow({
  c,
  claims,
  open,
  onToggle,
  onOpenTurn,
}: {
  c: Criterion;
  claims: Claim[];
  open: boolean;
  onToggle: () => void;
  onOpenTurn: (turnIdx: number) => void;
}) {
  const anchor = criterionAnchor(c.criterion_id);
  const panelId = `${anchor}-detail`;
  const critMiss = isCriticalMiss(c);
  return (
    <li
      id={anchor}
      className={`scroll-mt-28 rounded-card border bg-surface ${critMiss ? "border-2 border-danger" : "border-line"}`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(c.status)}>
            <StatusIcon status={c.status} />
            {statusLabel(c.status)}
          </Badge>
          {c.critical && <Badge tone={critMiss ? "danger" : "neutral"}>{vi.debrief.rubric.critical}</Badge>}
          {c.flagged && <Badge tone="warning">{vi.debrief.rubric.flagged}</Badge>}
          {c.low_reliability && <Badge tone="neutral">{vi.debrief.rubric.lowReliability}</Badge>}
          <span className="tabular ml-auto text-xs text-ink-muted">
            {fmt(vi.debrief.rubric.weight, { weight: c.weight })}
          </span>
        </div>
        <p className="mt-3 font-semibold leading-snug text-ink">{c.criterion}</p>
        {c.feedback && <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-muted">{c.feedback}</p>}
        {c.flagged && <p className="mt-1.5 text-xs text-warning">{vi.debrief.rubric.flaggedHint}</p>}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={`mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 -mx-2 text-sm font-semibold text-primary-strong hover:underline ${FOCUS_RING}`}
        >
          {open ? vi.debrief.rubric.hideDetail : vi.debrief.rubric.showDetail}
          <Chevron open={open} />
        </button>
      </div>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-line px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
          <div>
            <p className="text-xs font-semibold text-ink-muted">{vi.debrief.rubric.evidence}</p>
            <EvidenceQuotes c={c} onOpenTurn={onOpenTurn} />
          </div>
          {claims.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-muted">{vi.debrief.rubric.related}</p>
              <ul className="mt-2 space-y-2">
                {claims.map((cl, i) => (
                  <ClaimRow key={i} claim={cl} className="bg-canvas/60" />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The full checklist (step 3): filter by result, grouped by rubric domain in interview
 * order, misses first inside a group. Each row shows result and feedback; its evidence
 * quotes and the claims cited for it open on demand. `#crit-<id>` links (red-flag
 * banner) switch to "all" if needed, open the row and scroll to it.
 */
export default function RubricEvidenceList({
  evaluation,
  claimsByCriterion,
  onOpenTurn,
}: {
  evaluation: Evaluation;
  claimsByCriterion: Map<string, Claim[]>;
  onOpenTurn: (turnIdx: number) => void;
}) {
  const criteria = useMemo(() => evaluation.criteria ?? [], [evaluation.criteria]);
  const counts = countByFilter(criteria);
  const [filter, setFilter] = useState<ResultFilter>(() => defaultFilter(criteria));
  // Critical misses start open: they are the first thing to review.
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(criteria.filter(isCriticalMiss).map((c) => c.criterion_id)),
  );
  const groups = groupByDomain(criteria.filter((c) => matchesFilter(c, filter)));

  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    function focusFromHash() {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const target = criteria.find((c) => criterionAnchor(c.criterion_id) === hash);
      if (!target) return;
      setFilter((f) => (matchesFilter(target, f) ? f : "all"));
      setOpenIds((prev) => new Set(prev).add(target.criterion_id));
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
    }
    focusFromHash();
    window.addEventListener("hashchange", focusFromHash);
    return () => window.removeEventListener("hashchange", focusFromHash);
  }, [criteria]);

  return (
    <Tile className="space-y-6">
      <div role="group" aria-label={vi.debrief.filters.label} className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const on = filter === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${FOCUS_RING} ${
                on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink hover:border-ink"
              }`}
            >
              {vi.debrief.filters[f]}
              <span
                className={`tabular rounded-full px-2 py-0.5 text-xs ${on ? "bg-white/15" : "bg-canvas text-ink-muted"}`}
              >
                {counts[f]}
              </span>
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm italic text-ink-muted">{vi.debrief.filters.empty}</p>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-labelledby={`domain-${g.key}`}>
            <h3
              id={`domain-${g.key}`}
              className="flex items-baseline gap-2 border-b border-line pb-2 font-display text-lg font-bold tracking-tight"
            >
              {DOMAIN_LABEL[g.key] ?? g.key}
              <span className="tabular text-sm font-semibold text-ink-muted">{g.items.length}</span>
            </h3>
            <ol className="mt-3 space-y-3">
              {g.items.map((c) => (
                <CriterionRow
                  key={c.criterion_id}
                  c={c}
                  claims={claimsByCriterion.get(c.criterion_id) ?? []}
                  open={openIds.has(c.criterion_id)}
                  onToggle={() => toggle(c.criterion_id)}
                  onOpenTurn={onOpenTurn}
                />
              ))}
            </ol>
          </section>
        ))
      )}
    </Tile>
  );
}
