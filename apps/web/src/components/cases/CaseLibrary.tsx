"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import vi from "../../../messages/vi.json";
import { buttonClass } from "@/components/ui/Button";
import Tile, { TILE_MUTED } from "@/components/ui/Tile";
import { fmt } from "@/lib/sessionAuth";
import CaseCard from "./CaseCard";
import CaseFilters from "./CaseFilters";
import {
  EMPTY_FILTERS,
  REVEAL_KEY,
  filterCases,
  filtersToQuery,
  hasActiveFilters,
  parseFilters,
  parseReveal,
  specialtiesOf,
  type CaseFilters as Filters,
} from "./libraryHelpers";
import { useCaseLibrary } from "./useCaseLibrary";

const t = vi.cases;

// The reveal switch lives in localStorage; reads and writes never throw (private mode).
const REVEAL_EVENT = "avp-cases-reveal";
/** The stored switch, or null when storage cannot be read. */
function readReveal(): boolean | null {
  try {
    return parseReveal(localStorage.getItem(REVEAL_KEY));
  } catch {
    return null;
  }
}
function writeReveal(on: boolean): void {
  try {
    if (on) localStorage.setItem(REVEAL_KEY, "1");
    else localStorage.removeItem(REVEAL_KEY);
  } catch {
    /* ignore: the switch still works for this page view */
  }
  window.dispatchEvent(new Event(REVEAL_EVENT));
}
let revealFallback = false; // used when storage is unavailable
function subscribeReveal(cb: () => void): () => void {
  window.addEventListener(REVEAL_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(REVEAL_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function revealSnapshot(): boolean {
  return readReveal() ?? revealFallback;
}

/** Six fixed-size placeholder cards (no layout shift when the list arrives). */
export function CaseGridSkeleton() {
  return (
    <div aria-busy="true">
      <p className="mb-4 flex items-center gap-3 text-sm text-ink-muted" role="status">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary motion-reduce:animate-none"
          aria-hidden="true"
        />
        {t.loading}
      </p>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <li key={i} className="overflow-hidden rounded-tile bg-surface ring-1 ring-line/70">
            <div className="aspect-video w-full animate-pulse bg-canvas motion-reduce:animate-none" />
            <div className="space-y-3 p-5">
              <div className="h-4 w-1/2 animate-pulse rounded bg-canvas motion-reduce:animate-none" />
              <div className="h-6 w-full animate-pulse rounded bg-canvas motion-reduce:animate-none" />
              <div className="h-6 w-3/4 animate-pulse rounded bg-canvas motion-reduce:animate-none" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-canvas motion-reduce:animate-none" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** /cases body: filters from the URL, the card grid and its loading/error/empty states. */
export default function CaseLibrary() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const reveal = useSyncExternalStore(subscribeReveal, revealSnapshot, () => false);
  const setReveal = useCallback((on: boolean) => {
    revealFallback = on;
    writeReveal(on);
  }, []);

  const lib = useCaseLibrary(reveal);
  const specialties = useMemo(() => specialtiesOf(lib.cases), [lib.cases]);
  // "Chỉ ca chưa luyện" only exists signed in; a guest opening such a link sees every case.
  const effective: Filters = lib.signedIn ? filters : { ...filters, unpractised: false };
  const shown = filterCases(lib.cases, effective, lib.practice);

  const setFilters = useCallback(
    (next: Filters) => {
      router.replace(`${pathname}${filtersToQuery(next)}`, { scroll: false });
    },
    [router, pathname],
  );
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  if (lib.state === "loading") return <CaseGridSkeleton />;

  if (lib.state === "error") {
    return (
      <div
        role="alert"
        className="flex max-w-2xl flex-col gap-4 rounded-card border border-warning/30 bg-warning-soft p-5 text-warning sm:flex-row sm:items-center sm:justify-between"
      >
        <p>{t.loadError}</p>
        <button type="button" onClick={lib.reload} className={buttonClass({ variant: "secondary" })}>
          {t.retry}
        </button>
      </div>
    );
  }

  if (lib.cases.length === 0) {
    return (
      <Tile tone="mint" className="max-w-2xl">
        <p className="font-display text-2xl font-bold tracking-tight">{t.emptyTitle}</p>
        <p className={`mt-2 ${TILE_MUTED.mint}`}>{t.emptyBody}</p>
      </Tile>
    );
  }

  return (
    <>
      <CaseFilters
        filters={effective}
        specialties={specialties}
        signedIn={lib.signedIn}
        onChange={setFilters}
        reveal={reveal}
        onRevealChange={setReveal}
      />

      <p role="status" aria-live="polite" className="mb-4 text-sm text-ink-muted">
        {fmt(t.resultCount, { n: shown.length })}
        {lib.practiceError && <span className="ml-3">{t.practiceError}</span>}
      </p>

      {shown.length === 0 ? (
        <Tile tone="sky" className="max-w-2xl">
          <p className="font-display text-2xl font-bold tracking-tight">{t.noMatchTitle}</p>
          <p className={`mt-2 ${TILE_MUTED.sky}`}>{t.noMatchBody}</p>
          {hasActiveFilters(effective) && (
            <button type="button" onClick={clearFilters} className={buttonClass({ variant: "primary", className: "mt-6" })}>
              {t.filters.clear}
            </button>
          )}
        </Tile>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <CaseCard
              key={c.id}
              item={c}
              signedIn={lib.signedIn}
              practice={lib.practice ? (lib.practice.get(c.id) ?? { count: 0, lastScore: null }) : undefined}
              reveal={reveal}
              revealedName={reveal ? (lib.revealedNames ? (lib.revealedNames.get(c.id) ?? null) : undefined) : undefined}
            />
          ))}
        </ul>
      )}
    </>
  );
}
