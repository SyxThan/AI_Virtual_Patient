"use client";

import { useCallback, useEffect, useState } from "react";
import vi from "../../messages/vi.json";
import type { components } from "./api-client/schema";
import { API_URL, authHeaders, fmt, whenAuthReady } from "./sessionAuth";

/**
 * One case's card data from `GET /api/v1/cases/{id}` (AVP-147). It never holds
 * the answer key nor, without `reveal`, the disease name: Setup, history and the
 * workspace name a case by its presenting complaint, like the /cases library.
 */
export type CaseSummary = components["schemas"]["CaseSummary"];
export type CaseExamRegion = components["schemas"]["CaseExamRegion"];

export type CaseLoad =
  | { status: "missing" } // no ?case= in the URL
  | { status: "loading" }
  | { status: "ok"; data: CaseSummary }
  | { status: "notFound" } // unknown or inactive case id
  | { status: "error" };

/** `?case=` value -> a usable id, or null (blank or absurd values count as missing). */
export function parseCaseParam(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return v && v.length <= 120 ? v : null;
}

export async function fetchCaseSummary(caseId: string, signal?: AbortSignal): Promise<CaseLoad> {
  try {
    const res = await fetch(`${API_URL}/api/v1/cases/${encodeURIComponent(caseId)}`, { signal });
    if (res.status === 404 || res.status === 422) return { status: "notFound" };
    if (!res.ok) return { status: "error" };
    return { status: "ok", data: (await res.json()) as CaseSummary };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return { status: "error" };
  }
}

/** Loads the case named by `caseId` (null -> "missing"); `retry` refetches. */
export function useCaseSummary(caseId: string | null): CaseLoad & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<{ key: string; value: CaseLoad } | null>(null);
  const key = `${caseId ?? ""}#${attempt}`;

  useEffect(() => {
    if (!caseId) return;
    const ctrl = new AbortController();
    fetchCaseSummary(caseId, ctrl.signal).then(
      (value) => setLoad({ key, value }),
      () => {}, // aborted: a newer request owns the state
    );
    return () => ctrl.abort();
  }, [caseId, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (!caseId) return { status: "missing", retry };
  if (!load || load.key !== key) return { status: "loading", retry };
  return { ...load.value, retry };
}

/**
 * The case summary of an existing session (debrief, workspace): reads the
 * session's `case_id` (owner-checked by the API), then the case card. null while
 * loading or when either call fails; callers then fall back to neutral text.
 */
export function useSessionCase(sessionId: string): CaseSummary | null {
  const [found, setFound] = useState<{ id: string; data: CaseSummary } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        await whenAuthReady();
        const res = await fetch(`${API_URL}/api/v1/sessions/${sessionId}`, {
          headers: authHeaders(),
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const { case_id } = (await res.json()) as { case_id?: string };
        if (!case_id) return;
        const load = await fetchCaseSummary(case_id, ctrl.signal);
        if (load.status === "ok") setFound({ id: sessionId, data: load.data });
      } catch {
        /* aborted or offline: keep the neutral fallback */
      }
    })();
    return () => ctrl.abort();
  }, [sessionId]);
  return found?.id === sessionId ? found.data : null;
}

const t = vi.caseSetup;

/** "Bé 18 tháng · nam · mẹ đưa đến khám" style line from patient facts only. */
export function patientLine(c: CaseSummary): string {
  const p = c.patient;
  const units = t.ageUnits as Record<string, string>;
  const age = units[p.age_unit] ? fmt(units[p.age_unit], { n: p.age_value }) : `${p.age_value} ${p.age_unit}`;
  const sex = (t.sex as Record<string, string>)[p.sex];
  const informants = t.informant as Record<string, string>;
  const who = informants[p.informant_role] ?? informants.other;
  return [age, sex, who].filter(Boolean).join(" · ");
}

/** Non-revealing case name: the presenting complaint, else a neutral fallback. */
export function caseLabel(c: Pick<CaseSummary, "catalog"> | null | undefined): string {
  return c?.catalog?.display_complaint ?? t.defaultCase;
}

/** Only local public paths are rendered (next/image has no remote hosts configured). */
export function localCover(c: CaseSummary): string | null {
  const cover = c.catalog?.cover;
  return cover && cover.startsWith("/") && !cover.startsWith("//") ? cover : null;
}

/** Exam stage of a case: 3D only when the case says so (HFMD); 2D otherwise. */
export function examModeOf(c: CaseSummary | null | undefined): "3d" | "2d" {
  return c?.catalog?.exam_mode === "3d" ? "3d" : "2d";
}
