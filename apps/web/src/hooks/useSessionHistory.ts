"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, authHeaders } from "@/lib/sessionAuth";

// Local types mirroring the API (SessionSummaryPage / ProgressResponse in
// docs/specs/openapi.yaml). Kept here until the generated client is refreshed.
export type EvaluationStatus = "none" | "pending" | "done" | "failed";

export type SessionSummary = {
  id: string;
  case_id: string;
  case_title?: string | null;
  mode: string;
  status: string;
  started_at: string;
  ended_at?: string | null;
  total_score?: number | null;
  critical_missed: boolean;
  evaluation_status: EvaluationStatus;
};

type SessionSummaryPage = { items: SessionSummary[]; next_cursor?: string | null };

export type ProgressAttempt = {
  session_id: string;
  started_at: string;
  total_score: number | null;
  critical_missed: boolean;
  rubric_version: number;
};

export type ProgressCriterion = {
  criterion_id: string;
  criterion: string;
  attempts: number;
  met: number;
  partial: number;
};

export type ProgressRubricGroup = { rubric_version: number; criteria: ProgressCriterion[] };

export type Progress = {
  attempts: ProgressAttempt[];
  rubric_groups: ProgressRubricGroup[];
  practice_feedback_only: boolean;
  notice: string;
};

export type HistoryState = "loading" | "ready" | "unauthorized" | "error";

type Loaded<T> = { kind: "ok"; data: T } | { kind: "unauthorized" } | { kind: "error" };

async function getJson<T>(path: string): Promise<Loaded<T>> {
  try {
    const res = await fetch(`${API_URL}/api/v1/${path}`, { headers: authHeaders() });
    if (res.status === 401) return { kind: "unauthorized" };
    if (!res.ok) return { kind: "error" };
    return { kind: "ok", data: (await res.json()) as T };
  } catch {
    return { kind: "error" };
  }
}

const PAGE_SIZE = 20;

/**
 * Practice history for /history: first page + progress, "load more" by cursor.
 * Refetches when the auth state changes (window event "avp-auth-changed").
 */
export function useSessionHistory() {
  const [state, setState] = useState<HistoryState>("loading");
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressError, setProgressError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [generation, setGeneration] = useState(0);
  const latest = useRef(0); // ignore responses from a superseded load

  useEffect(() => {
    const run = ++latest.current;
    const stale = () => run !== latest.current;
    void (async () => {
      const [list, prog] = await Promise.all([
        getJson<SessionSummaryPage>(`sessions?limit=${PAGE_SIZE}`),
        getJson<Progress>("sessions/progress"),
      ]);
      if (stale()) return;
      if (list.kind === "unauthorized") {
        setItems([]);
        setNextCursor(null);
        setProgress(null);
        setState("unauthorized");
        return;
      }
      if (list.kind === "error") {
        setState("error");
        return;
      }
      setItems(list.data.items);
      setNextCursor(list.data.next_cursor ?? null);
      setProgress(prog.kind === "ok" ? prog.data : null);
      setProgressError(prog.kind === "error");
      setLoadingMore(false);
      setLoadMoreError(false);
      setState("ready");
    })();
  }, [generation]);

  const reload = useCallback(() => {
    setState("loading");
    setGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    window.addEventListener("avp-auth-changed", reload);
    return () => window.removeEventListener("avp-auth-changed", reload);
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const run = latest.current;
    setLoadingMore(true);
    setLoadMoreError(false);
    const page = await getJson<SessionSummaryPage>(
      `sessions?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
    );
    if (run !== latest.current) return;
    setLoadingMore(false);
    if (page.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (page.kind === "error") {
      setLoadMoreError(true);
      return;
    }
    setItems((prev) => {
      const seen = new Set(prev.map((s) => s.id));
      return [...prev, ...page.data.items.filter((s) => !seen.has(s.id))];
    });
    setNextCursor(page.data.next_cursor ?? null);
  }, [nextCursor, loadingMore]);

  return {
    state,
    items,
    hasMore: nextCursor !== null,
    loadingMore,
    loadMoreError,
    loadMore,
    reload,
    progress,
    progressError,
  };
}
