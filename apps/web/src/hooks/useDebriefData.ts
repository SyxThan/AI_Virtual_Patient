"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { components } from "@/lib/api-client/schema";
import { API_URL, authHeaders } from "@/lib/sessionAuth";

export type Evaluation = components["schemas"]["EvaluationResponse"];
export type Debrief = components["schemas"]["DebriefResponse"];
export type TurnRow = components["schemas"]["TurnResponse"];

// "pending" covers HTTP 202; "notFinished" is 409 (session still active).
export type LoadState = "loading" | "pending" | "ready" | "notFound" | "notFinished" | "error";

const POLL_MS = 1500;
const MAX_POLLS = 120; // ~3 minutes, then ask the user to reload

type Fetched<T> = { state: LoadState; data: T | null };

async function getJson<T>(path: string): Promise<Fetched<T>> {
  const res = await fetch(`${API_URL}/api/v1/sessions/${path}`, { headers: authHeaders() });
  if (res.status === 202) return { state: "pending", data: (await res.json()) as T };
  if (res.status === 404) return { state: "notFound", data: null };
  if (res.status === 409) return { state: "notFinished", data: null };
  if (!res.ok) return { state: "error", data: null };
  return { state: "ready", data: (await res.json()) as T };
}

/**
 * Cold-path results for /debrief/[id]: evaluation, debrief and transcript.
 * Polls every 1.5 s while either result is pending (HTTP 202), stops once both
 * are settled (done/failed) or after MAX_POLLS.
 */
export function useDebriefData(id: string) {
  const [evaluation, setEvaluation] = useState<Fetched<Evaluation>>({ state: "loading", data: null });
  const [debrief, setDebrief] = useState<Fetched<Debrief>>({ state: "loading", data: null });
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [timedOut, setTimedOut] = useState(false);
  const [generation, setGeneration] = useState(0); // bump to restart polling
  const polls = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    polls.current = 0;

    const tick = async () => {
      try {
        const [ev, db] = await Promise.all([
          getJson<Evaluation>(`${id}/evaluation`),
          getJson<Debrief>(`${id}/debrief`),
        ]);
        if (cancelled) return;
        setEvaluation(ev);
        setDebrief(db);
        const waiting = ev.state === "pending" || db.state === "pending";
        if (!waiting) {
          // Transcript is the evidence source; load it once results are settled.
          const tr = await getJson<TurnRow[]>(`${id}/turns`);
          if (!cancelled && tr.data) setTurns(tr.data);
          return;
        }
        polls.current += 1;
        if (polls.current >= MAX_POLLS) {
          setTimedOut(true);
          return;
        }
        timer = setTimeout(tick, POLL_MS);
      } catch {
        if (!cancelled) setEvaluation({ state: "error", data: null });
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, generation]);

  const refresh = useCallback(() => {
    setTimedOut(false);
    setEvaluation({ state: "loading", data: null });
    setDebrief({ state: "loading", data: null });
    setGeneration((g) => g + 1);
  }, []);

  /** POST /evaluation/retry, then poll again. Returns false if the request failed. */
  const retry = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${id}/evaluation/retry`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) return false;
      refresh();
      return true;
    } catch {
      return false;
    }
  }, [id, refresh]);

  return { evaluation, debrief, turns, timedOut, retry, refresh };
}
