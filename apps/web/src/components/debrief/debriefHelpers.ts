/**
 * Pure helpers for the debrief screen (AVP-169): group criteria by rubric domain,
 * order them so misses come first, filter by result, attach cited claims.
 * No React and no JSON imports, so `node --test` can check them directly.
 */

import type { components } from "../../lib/api-client/schema.ts";

export type Criterion = components["schemas"]["CriterionResultResponse"];
export type Claim = components["schemas"]["DebriefClaimItem"];
export type Status = Criterion["status"];

/** Interview order: the order a student meets these steps in an OSCE station. */
export const DOMAIN_ORDER = [
  "history",
  "epidemiology",
  "physical_exam",
  "investigations",
  "diagnosis",
  "management",
  "communication",
] as const;
export const OTHER_DOMAIN = "other";

export type ResultFilter = "missed" | "all" | "met";

const MISSED: ReadonlySet<string> = new Set(["unmet", "partial", "insufficient_evidence"]);
// Within a group: the gaps to work on first, then what went well.
const STATUS_RANK: Record<string, number> = { unmet: 0, insufficient_evidence: 1, partial: 2, met: 3 };

export function isMissed(c: Pick<Criterion, "status">): boolean {
  return MISSED.has(c.status);
}

/** A critical criterion that was not fully met (what the red-flag banner lists). */
export function isCriticalMiss(c: Pick<Criterion, "critical" | "status">): boolean {
  return c.critical && (c.status === "unmet" || c.status === "insufficient_evidence");
}

export function domainKey(c: Pick<Criterion, "domain">): string {
  const d = c.domain ?? "";
  return (DOMAIN_ORDER as readonly string[]).includes(d) ? d : OTHER_DOMAIN;
}

export function matchesFilter(c: Pick<Criterion, "status">, f: ResultFilter): boolean {
  if (f === "all") return true;
  return f === "missed" ? isMissed(c) : !isMissed(c);
}

export function countByFilter(criteria: Pick<Criterion, "status">[]): Record<ResultFilter, number> {
  const missed = criteria.filter(isMissed).length;
  return { all: criteria.length, missed, met: criteria.length - missed };
}

/** Start on the gaps when there are any; otherwise show everything. */
export function defaultFilter(criteria: Pick<Criterion, "status">[]): ResultFilter {
  return criteria.some(isMissed) ? "missed" : "all";
}

export type DomainGroup<T> = { key: string; items: T[] };

/**
 * Groups in DOMAIN_ORDER (unknown or missing domains last, as "other"). Inside a
 * group: critical misses first, then by status rank, then rubric order (stable).
 */
export function groupByDomain<T extends Pick<Criterion, "domain" | "status" | "critical">>(
  criteria: T[],
): DomainGroup<T>[] {
  const buckets = new Map<string, { item: T; i: number }[]>();
  criteria.forEach((item, i) => {
    const k = domainKey(item);
    const list = buckets.get(k) ?? [];
    list.push({ item, i });
    buckets.set(k, list);
  });
  const order = [...DOMAIN_ORDER, OTHER_DOMAIN];
  return order
    .filter((k) => buckets.has(k))
    .map((key) => ({
      key,
      items: (buckets.get(key) ?? [])
        .sort(
          (a, b) =>
            Number(isCriticalMiss(b.item)) - Number(isCriticalMiss(a.item)) ||
            (STATUS_RANK[a.item.status] ?? 9) - (STATUS_RANK[b.item.status] ?? 9) ||
            a.i - b.i,
        )
        .map((x) => x.item),
    }));
}

/** Per-domain tally for the overview. `items` keep rubric order (one bar segment each). */
export function domainSummary<T extends Pick<Criterion, "domain" | "status">>(
  criteria: T[],
): { key: string; met: number; total: number; items: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const c of criteria) {
    const k = domainKey(c);
    buckets.set(k, [...(buckets.get(k) ?? []), c]);
  }
  return [...DOMAIN_ORDER, OTHER_DOMAIN]
    .filter((k) => buckets.has(k))
    .map((key) => {
      const items = buckets.get(key) ?? [];
      return { key, met: items.filter((c) => c.status === "met").length, total: items.length, items };
    });
}

/**
 * Splits debrief claims into those about a known criterion (shown under it) and
 * general ones (claims with no criterion, or one the rubric does not list).
 */
export function splitClaims(
  claims: Claim[],
  criterionIds: Iterable<string>,
): { byCriterion: Map<string, Claim[]>; general: Claim[] } {
  const known = new Set(criterionIds);
  const byCriterion = new Map<string, Claim[]>();
  const general: Claim[] = [];
  for (const c of claims) {
    const id = c.criterion_id;
    if (id && known.has(id)) byCriterion.set(id, [...(byCriterion.get(id) ?? []), c]);
    else general.push(c);
  }
  return { byCriterion, general };
}

/** DOM id for a criterion row, safe for `#hash` links. */
export function criterionAnchor(criterionId: string): string {
  return `crit-${criterionId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}
