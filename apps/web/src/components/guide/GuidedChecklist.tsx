"use client";

import { useEffect, useId, useMemo, useState } from "react";
import vi from "../../../messages/vi.json";
import { buttonClass } from "@/components/ui/Button";
import Tile from "@/components/ui/Tile";
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
 * Guided-mode reminder list (TASK-S12-03). Items are the case rubric's
 * criterion titles, verbatim from the API, grouped by domain; the wording is a
 * draft awaiting clinician review. The student ticks items by hand. Ticks stay
 * in this browser tab only and are never sent anywhere or scored.
 */
export default function GuidedChecklist({
  sessionId,
  items,
  state,
  onRetry,
}: {
  sessionId: string;
  items: GuideItem[];
  state: "loading" | "ready" | "error";
  onRetry: () => void;
}) {
  const [ticks, setTicks] = useState<Set<string>>(new Set());
  const headingId = useId();

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setTicks(new Set(readTicks(sessionId)));
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const groups = useMemo(() => {
    const map = new Map<string, GuideItem[]>();
    for (const it of items) map.set(it.domain, [...(map.get(it.domain) ?? []), it]);
    return [...map.entries()];
  }, [items]);

  function toggle(id: string) {
    setTicks((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeTicks(sessionId, next);
      return next;
    });
  }

  const done = items.filter((i) => ticks.has(i.criterion_id)).length;

  return (
    <Tile as="section" tone="mint" compact aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-base font-bold text-ink">
          {vi.guide.title}
        </h2>
        {state === "ready" && items.length > 0 && (
          <span className="tabular text-sm font-semibold" aria-live="polite">
            {fmt(vi.guide.progress, { done, total: items.length })}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed">{vi.guide.subtitle}</p>
      <p className="mt-3 flex items-start gap-2 rounded-control bg-surface/70 px-3 py-2 text-sm text-warning">
        <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0" fill="none" aria-hidden="true">
          <path d="M10 3l7.5 13h-15L10 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M10 8.5v3.5M10 14.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {vi.guide.draft}
      </p>

      {state === "loading" && (
        <div className="mt-4 space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 animate-pulse rounded-control bg-surface/70 motion-reduce:animate-none" />
          ))}
        </div>
      )}
      {state === "error" && (
        <div role="alert" className="mt-4 rounded-control bg-surface px-3 py-3 text-sm text-ink">
          <p>{vi.guide.loadError}</p>
          <button type="button" onClick={onRetry} className={buttonClass({ variant: "secondary", className: "mt-2" })}>
            {vi.guide.retry}
          </button>
        </div>
      )}
      {state === "ready" && items.length === 0 && (
        <p className="mt-4 text-sm">{vi.guide.empty}</p>
      )}
      {state === "ready" && groups.length > 0 && (
        <div className="mt-4 space-y-4">
          {groups.map(([domain, list]) => (
            <fieldset key={domain}>
              <legend className="text-sm font-bold text-ink">
                {vi.guide.domains[domain as DomainKey] ?? domain}
              </legend>
              <ul className="mt-1.5 overflow-hidden rounded-card bg-surface">
                {list.map((it) => {
                  const checked = ticks.has(it.criterion_id);
                  const inputId = `guide-${sessionId}-${it.criterion_id}`;
                  return (
                    <li key={it.criterion_id} className="border-b border-line last:border-b-0">
                      <label
                        htmlFor={inputId}
                        className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5"
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(it.criterion_id)}
                          className={`mt-0.5 h-5 w-5 shrink-0 accent-primary ${FOCUS_RING}`}
                        />
                        <span
                          className={`text-sm leading-snug ${checked ? "text-ink-muted line-through" : "text-ink"}`}
                        >
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
    </Tile>
  );
}
