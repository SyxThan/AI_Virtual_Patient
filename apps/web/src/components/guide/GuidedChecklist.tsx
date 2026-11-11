"use client";

import { useEffect, useId, useMemo, useState } from "react";
import vi from "../../../messages/vi.json";
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
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-gray-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="font-semibold text-gray-900">
          {vi.guide.title}
        </h2>
        {state === "ready" && items.length > 0 && (
          <span className="text-xs text-gray-700" aria-live="polite">
            {fmt(vi.guide.progress, { done, total: items.length })}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-700">{vi.guide.subtitle}</p>
      <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-950">
        <span aria-hidden="true">⚠ </span>
        {vi.guide.draft}
      </p>

      {state === "loading" && (
        <div className="mt-3 space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      )}
      {state === "error" && (
        <div role="alert" className="mt-3 text-sm text-red-900">
          <p>{vi.guide.loadError}</p>
          <button
            type="button"
            onClick={onRetry}
            className={`mt-2 rounded-md border border-gray-400 px-3 py-1 text-xs font-medium text-gray-900 ${FOCUS_RING}`}
          >
            {vi.guide.retry}
          </button>
        </div>
      )}
      {state === "ready" && items.length === 0 && (
        <p className="mt-3 text-sm text-gray-700">{vi.guide.empty}</p>
      )}
      {state === "ready" && groups.length > 0 && (
        <div className="mt-3 space-y-3">
          {groups.map(([domain, list]) => (
            <fieldset key={domain}>
              <legend className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                {vi.guide.domains[domain as DomainKey] ?? domain}
              </legend>
              <ul className="mt-1 space-y-1">
                {list.map((it) => {
                  const checked = ticks.has(it.criterion_id);
                  const inputId = `guide-${sessionId}-${it.criterion_id}`;
                  return (
                    <li key={it.criterion_id} className="flex items-start gap-2">
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(it.criterion_id)}
                        className={`mt-0.5 h-4 w-4 shrink-0 accent-blue-700 ${FOCUS_RING}`}
                      />
                      <label
                        htmlFor={inputId}
                        className={`text-sm leading-snug ${checked ? "text-gray-600 line-through" : "text-gray-900"}`}
                      >
                        {it.title}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
        </div>
      )}
    </section>
  );
}
