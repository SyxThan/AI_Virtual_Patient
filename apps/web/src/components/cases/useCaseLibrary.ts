"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { components } from "@/lib/api-client/schema";
import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL, authHeaders, whenAuthReady } from "@/lib/sessionAuth";
import {
  aggregatePractice,
  catalogCases,
  type CatalogCase,
  type PracticeStats,
  type SessionSummary,
} from "./libraryHelpers";

type CaseListResponse = components["schemas"]["CaseListResponse"];
type CaseSummary = components["schemas"]["CaseSummary"];
type SessionSummaryPage = components["schemas"]["SessionSummaryPage"];

export type LibraryState = "loading" | "ready" | "error";

/** GET /sessions pages read for the practice counts (50 per page, the API maximum). */
const SESSION_PAGE_SIZE = 50;
const SESSION_MAX_PAGES = 4;

async function getJson<T>(path: string, withAuth: boolean): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/${path}`, {
      headers: withAuth ? authHeaders() : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** The signed-in learner's sessions (bounded), or null when they cannot be read. */
async function loadSessions(): Promise<SessionSummary[] | null> {
  const all: SessionSummary[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < SESSION_MAX_PAGES; page++) {
    const q: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const data: SessionSummaryPage | null = await getJson<SessionSummaryPage>(
      `sessions?limit=${SESSION_PAGE_SIZE}${q}`,
      true,
    );
    if (!data) return page === 0 ? null : all;
    all.push(...data.items);
    cursor = data.next_cursor ?? null;
    if (!cursor) break;
  }
  return all;
}

/**
 * Data for /cases: the public case list, the signed-in learner's practice stats
 * (GET /sessions; guests get none and no error), and, only while the practice-only
 * "Hiện tên bệnh" switch is on, each case's name from GET /cases/{id}?reveal=true.
 */
export function useCaseLibrary(reveal: boolean) {
  const { status: authStatus } = useAuth();
  const signedIn = authStatus === "signedIn";

  const [state, setState] = useState<LibraryState>("loading");
  const [cases, setCases] = useState<CatalogCase[]>([]);
  const [generation, setGeneration] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const run = ++latest.current;
    void (async () => {
      const data = await getJson<CaseListResponse>("cases", false);
      if (run !== latest.current) return;
      if (!data) {
        setState("error");
        return;
      }
      setCases(catalogCases(data.items));
      setState("ready");
    })();
  }, [generation]);

  const reload = useCallback(() => {
    setState("loading");
    setGeneration((g) => g + 1);
  }, []);

  // Practice stats: signed in only. Keyed by auth status so sign-in/out refreshes them.
  const [practice, setPractice] = useState<{ key: string; stats: PracticeStats | null; failed: boolean }>({
    key: "",
    stats: null,
    failed: false,
  });
  const practiceKey = signedIn ? `in:${generation}` : "";
  useEffect(() => {
    if (!practiceKey) return;
    let cancelled = false;
    void (async () => {
      await whenAuthReady();
      const sessions = await loadSessions();
      if (cancelled) return;
      setPractice({
        key: practiceKey,
        stats: sessions ? aggregatePractice(sessions) : null,
        failed: sessions === null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [practiceKey]);
  const practiceReady = signedIn && practice.key === practiceKey;

  // Revealed names, fetched per case only while the switch is on.
  const [names, setNames] = useState<{ key: string; byId: Map<string, string | null> }>({
    key: "",
    byId: new Map(),
  });
  const idsKey = cases.map((c) => c.id).join("|");
  const namesKey = reveal && state === "ready" ? idsKey : "";
  useEffect(() => {
    if (!namesKey) return;
    let cancelled = false;
    void (async () => {
      const ids = namesKey.split("|").filter(Boolean);
      const results = await Promise.all(
        ids.map((id) => getJson<CaseSummary>(`cases/${encodeURIComponent(id)}?reveal=true`, false)),
      );
      if (cancelled) return;
      const byId = new Map<string, string | null>();
      ids.forEach((id, i) => byId.set(id, results[i]?.title ?? results[i]?.diagnosis ?? null));
      setNames({ key: namesKey, byId });
    })();
    return () => {
      cancelled = true;
    };
  }, [namesKey]);

  return {
    state,
    cases,
    reload,
    signedIn,
    /** null while unknown (guest, loading or failed). */
    practice: practiceReady ? practice.stats : null,
    practiceError: practiceReady && practice.failed,
    /** null when the switch is off or names are still loading. */
    revealedNames: namesKey && names.key === namesKey ? names.byId : null,
  };
}
