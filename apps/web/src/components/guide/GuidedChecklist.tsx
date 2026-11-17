"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import vi from "../../../messages/vi.json";
import { buttonClass } from "@/components/ui/Button";
import { FOCUS_RING } from "@/components/ui/focus";
import { fmt } from "@/lib/sessionAuth";

/** Local mirror of the API's GuideItem (generated client is not committed). */
export type GuideItem = { criterion_id: string; domain: string; title: string };

type DomainKey = keyof typeof vi.guide.domains;

const storageKey = (sessionId: string) => `avp_guide_ticks_${sessionId}`;

function readTicks(sessionId: string): string[] {
  try {
    const raw = sessionStorage.getItem(storageKey(sessionId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return []; // storage blocked or corrupt: start unticked
  }
}

function writeTicks(sessionId: string, ticks: Set<string>): void {
  try {
    sessionStorage.setItem(storageKey(sessionId), JSON.stringify([...ticks]));
  } catch {
    /* ignore: ticks are a convenience only */
  }
}

/**
 * The learner's own ticks on the reminder list. They stay in this browser tab
 * only and are never sent anywhere or scored.
 */
export function useGuideTicks(sessionId: string) {
  const [ticks, setTicks] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setTicks(new Set(readTicks(sessionId)));
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const toggle = useCallback(
    (id: string) => {
      setTicks((cur) => {
        const next = new Set(cur);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        writeTicks(sessionId, next);
        return next;
      });
    },
    [sessionId],
  );

  return { ticks, toggle };
}

/**
 * Guided-mode reminder list (TASK-S12-03) as a drawer pinned to the foot of
 * the conversation column: collapsed to one line ("Nhắc việc 2/8"), it opens
 * to at most half the column. Items are the case rubric's criterion titles,
 * verbatim from the API, grouped by domain; the wording is a draft awaiting
 * clinician review, and that notice stays inside the drawer.
 */
export default function GuidedChecklist({
  sessionId,
  items,
  state,
  ticks,
  onToggle,
  onRetry,
}: {
  sessionId: string;
  items: GuideItem[];
  state: "loading" | "ready" | "error";
  ticks: ReadonlySet<string>;
  onToggle: (criterionId: string) => void;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const groups = useMemo(() => {
    const map = new Map<string, GuideItem[]>();
    for (const it of items) map.set(it.domain, [...(map.get(it.domain) ?? []), it]);
    return [...map.entries()];
  }, [items]);

  const done = items.filter((i) => ticks.has(i.criterion_id)).length;

  return (
    <section aria-label={vi.guide.title} className="flex min-h-0 shrink-0 flex-col border-t border-line bg-mint-soft/60">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        title={open ? vi.cockpit.checklist.close : vi.cockpit.checklist.open}
        className={`flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-bold text-ink hover:bg-mint-soft ${FOCUS_RING} focus-visible:ring-inset focus-visible:ring-offset-0`}
      >
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-mint-ink" fill="none" aria-hidden="true">
            <path d="M8 5h9M8 10h9M8 15h9M3 5l1 1 2-2M3 10l1 1 2-2M3 15l1 1 2-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {state === "ready" && items.length > 0
            ? fmt(vi.cockpit.checklist.toggle, { done, total: items.length })
            : vi.guide.title}
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 transition-transform duration-[var(--dur-fast)] ${open ? "" : "rotate-180"}`}
          fill="none"
          aria-hidden="true"
        >
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div id={panelId} hidden={!open} className="max-h-[50cqh] overflow-y-auto overscroll-contain px-4 pb-4">
        <p className="text-sm leading-relaxed text-ink">{vi.guide.subtitle}</p>
        <p className="mt-2 flex items-start gap-2 rounded-control bg-surface/80 px-3 py-2 text-sm text-warning">
          <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0" fill="none" aria-hidden="true">
            <path d="M10 3l7.5 13h-15L10 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M10 8.5v3.5M10 14.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {vi.guide.draft}
        </p>

        {state === "loading" && (
          <div className="mt-3 space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-6 animate-pulse rounded-control bg-surface/70 motion-reduce:animate-none" />
            ))}
          </div>
        )}
        {state === "error" && (
          <div role="alert" className="mt-3 rounded-control bg-surface px-3 py-3 text-sm text-ink">
            <p>{vi.guide.loadError}</p>
            <button type="button" onClick={onRetry} className={buttonClass({ variant: "secondary", className: "mt-2" })}>
              {vi.guide.retry}
            </button>
          </div>
        )}
        {state === "ready" && items.length === 0 && <p className="mt-3 text-sm">{vi.guide.empty}</p>}
        {state === "ready" && groups.length > 0 && (
          <div className="mt-3 space-y-3">
            {groups.map(([domain, list]) => (
              <fieldset key={domain}>
                <legend className="text-sm font-bold text-ink">{vi.guide.domains[domain as DomainKey] ?? domain}</legend>
                <ul className="mt-1.5 overflow-hidden rounded-card bg-surface">
                  {list.map((it) => {
                    const checked = ticks.has(it.criterion_id);
                    const inputId = `guide-${sessionId}-${it.criterion_id}`;
                    return (
                      <li key={it.criterion_id} className="border-b border-line last:border-b-0">
                        <label htmlFor={inputId} className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5">
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggle(it.criterion_id)}
                            className={`mt-0.5 h-5 w-5 shrink-0 accent-primary ${FOCUS_RING}`}
                          />
                          <span className={`text-sm leading-snug ${checked ? "text-ink-muted line-through" : "text-ink"}`}>
                            {it.title}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
