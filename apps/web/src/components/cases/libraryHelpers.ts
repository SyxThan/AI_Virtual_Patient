/**
 * Pure helpers for the case library (/cases, Slice 20, AVP-148): URL filters,
 * patient-line formatting, practice counts from GET /sessions, filtering.
 * No React and no JSON imports, so `node --test` can check them directly;
 * callers pass the Vietnamese labels in.
 */

import type { components } from "../../lib/api-client/schema.ts";

export type CaseSummary = components["schemas"]["CaseSummary"];
export type CaseCatalog = components["schemas"]["CaseCatalog"];
export type SessionSummary = components["schemas"]["SessionSummary"];

/** A case that can be shown as a card: one without `catalog` cannot be rendered safely. */
export type CatalogCase = CaseSummary & { catalog: CaseCatalog };

export type PatientGroup = CaseCatalog["patient_group"];
export const PATIENT_GROUPS: readonly PatientGroup[] = ["child", "adult", "elderly"];

export type CaseFilters = {
  group: PatientGroup | null;
  specialty: string | null;
  unpractised: boolean;
};

export const EMPTY_FILTERS: CaseFilters = { group: null, specialty: null, unpractised: false };

/** localStorage key for the practice-only "Hiện tên bệnh" switch. */
export const REVEAL_KEY = "avp_cases_reveal_v1";

type ParamReader = { get(name: string): string | null };

/** Reads `?group=child&specialty=...&unpractised=1`; unknown values are dropped. */
export function parseFilters(params: ParamReader): CaseFilters {
  const g = params.get("group");
  const group = g && (PATIENT_GROUPS as readonly string[]).includes(g) ? (g as PatientGroup) : null;
  const s = params.get("specialty")?.trim();
  const u = params.get("unpractised");
  return { group, specialty: s ? s : null, unpractised: u === "1" || u === "true" };
}

/** The query string for a filter set ("" when nothing is filtered). Stable key order. */
export function filtersToQuery(f: CaseFilters): string {
  const q = new URLSearchParams();
  if (f.group) q.set("group", f.group);
  if (f.specialty) q.set("specialty", f.specialty);
  if (f.unpractised) q.set("unpractised", "1");
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function hasActiveFilters(f: CaseFilters): boolean {
  return f.group !== null || f.specialty !== null || f.unpractised;
}

export function hasCatalog(c: CaseSummary): c is CatalogCase {
  return c.catalog != null;
}

/** Cards in suggested order (`catalog.order`, then id); cases without catalog are dropped. */
export function catalogCases(items: readonly CaseSummary[]): CatalogCase[] {
  return items
    .filter(hasCatalog)
    .sort((a, b) => a.catalog.order - b.catalog.order || a.id.localeCompare(b.id));
}

/** Distinct specialties of the shown cases, sorted for the select (Vietnamese collation). */
export function specialtiesOf(cases: readonly CatalogCase[]): string[] {
  return [...new Set(cases.map((c) => c.specialty))].sort((a, b) => a.localeCompare(b, "vi"));
}

export type PracticeStat = { count: number; lastScore: number | null };
export type PracticeStats = Map<string, PracticeStat>;

/**
 * Times practised and the latest evaluated score per case. The last score comes
 * from the most recent session (by `started_at`) whose evaluation is done and has
 * a total; a newer unscored session does not hide it.
 */
export function aggregatePractice(sessions: readonly SessionSummary[]): PracticeStats {
  const out: PracticeStats = new Map();
  const scoredAt = new Map<string, number>();
  for (const s of sessions) {
    const stat = out.get(s.case_id) ?? { count: 0, lastScore: null };
    stat.count += 1;
    if (s.evaluation_status === "done" && s.total_score != null) {
      const t = Date.parse(s.started_at);
      const at = Number.isNaN(t) ? -Infinity : t;
      if (at >= (scoredAt.get(s.case_id) ?? -Infinity)) {
        scoredAt.set(s.case_id, at);
        stat.lastScore = s.total_score;
      }
    }
    out.set(s.case_id, stat);
  }
  return out;
}

/**
 * Applies the filters. "Chỉ ca chưa luyện" only applies when practice stats are
 * known (signed in); for a guest it is ignored rather than hiding everything.
 */
export function filterCases(
  cases: readonly CatalogCase[],
  f: CaseFilters,
  practice: PracticeStats | null,
): CatalogCase[] {
  return cases.filter((c) => {
    if (f.group && c.catalog.patient_group !== f.group) return false;
    if (f.specialty && c.specialty !== f.specialty) return false;
    if (f.unpractised && practice && (practice.get(c.id)?.count ?? 0) > 0) return false;
    return true;
  });
}

function fill(template: string, n: number | string): string {
  return template.replace("{n}", String(n));
}

/** "18 tháng", "7 tuổi"; an unknown unit falls back to the raw value and unit. */
export function formatAge(value: number, unit: string, units: Record<string, string>): string {
  const t = units[unit];
  return t ? fill(t, value) : `${value} ${unit}`;
}

/** Looks a code up in a label map, with a generic fallback for codes the UI does not know. */
export function labelFor(code: string, labels: Record<string, string>, fallback: string): string {
  return labels[code] ?? fallback;
}

/** Parses the stored reveal switch; anything but "1" means off (the default). */
export function parseReveal(raw: string | null | undefined): boolean {
  return raw === "1";
}
