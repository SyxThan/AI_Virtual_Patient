// Run: npm test (node --test with native TypeScript type stripping).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_FILTERS,
  aggregatePractice,
  catalogCases,
  filterCases,
  filtersToQuery,
  formatAge,
  hasActiveFilters,
  labelFor,
  parseFilters,
  parseReveal,
  specialtiesOf,
  type CaseSummary,
  type SessionSummary,
} from "./libraryHelpers.ts";

// Synthetic fixtures only (no real case content).
function makeCase(id: string, over: Partial<CaseSummary> = {}, group = "child", order = 1): CaseSummary {
  return {
    id,
    version: 1,
    specialty: "Spec A",
    review_status: "draft",
    patient: { age_value: 3, age_unit: "years", sex: "male", informant_role: "mother" },
    catalog: {
      patient_group: group as "child",
      display_complaint: "complaint",
      exam_mode: "2d",
      exam_regions: [],
      order,
    },
    ...over,
  };
}

function makeSession(case_id: string, started_at: string, over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: `${case_id}-${started_at}`,
    case_id,
    mode: "guided",
    status: "ended",
    started_at,
    critical_missed: false,
    evaluation_status: "none",
    ...over,
  };
}

const params = (q: string) => new URLSearchParams(q);

describe("parseFilters / filtersToQuery", () => {
  it("reads known values and drops unknown ones", () => {
    assert.deepEqual(parseFilters(params("group=adult&specialty=Nhi&unpractised=1")), {
      group: "adult",
      specialty: "Nhi",
      unpractised: true,
    });
    assert.deepEqual(parseFilters(params("group=teen&specialty=%20&unpractised=yes")), EMPTY_FILTERS);
    assert.deepEqual(parseFilters(params("")), EMPTY_FILTERS);
  });

  it("round-trips and omits empty filters", () => {
    assert.equal(filtersToQuery(EMPTY_FILTERS), "");
    const f = { group: "elderly" as const, specialty: "Nội - Tim mạch", unpractised: true };
    assert.deepEqual(parseFilters(params(filtersToQuery(f).slice(1))), f);
    assert.equal(filtersToQuery({ ...EMPTY_FILTERS, group: "child" }), "?group=child");
  });

  it("knows when anything is filtered", () => {
    assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
    assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, unpractised: true }), true);
  });
});

describe("catalogCases / specialtiesOf", () => {
  it("drops cases without catalog and sorts by catalog.order", () => {
    const list = [makeCase("b", {}, "child", 2), makeCase("x", { catalog: null }), makeCase("a", {}, "adult", 1)];
    assert.deepEqual(
      catalogCases(list).map((c) => c.id),
      ["a", "b"],
    );
  });

  it("lists distinct specialties", () => {
    const list = catalogCases([
      makeCase("a", { specialty: "Ngoại" }),
      makeCase("b", { specialty: "Nhi" }),
      makeCase("c", { specialty: "Ngoại" }),
    ]);
    assert.deepEqual(specialtiesOf(list), ["Ngoại", "Nhi"]);
  });
});

describe("aggregatePractice", () => {
  it("counts sessions and keeps the latest evaluated score", () => {
    const stats = aggregatePractice([
      makeSession("a", "2026-11-10T08:00:00Z", { evaluation_status: "done", total_score: 60 }),
      makeSession("a", "2026-11-12T08:00:00Z", { evaluation_status: "done", total_score: 78 }),
      makeSession("a", "2026-11-13T08:00:00Z", { evaluation_status: "pending" }),
      makeSession("b", "2026-11-11T08:00:00Z"),
    ]);
    assert.deepEqual(stats.get("a"), { count: 3, lastScore: 78 });
    assert.deepEqual(stats.get("b"), { count: 1, lastScore: null });
    assert.equal(stats.get("c"), undefined);
  });

  it("does not depend on the input order", () => {
    const stats = aggregatePractice([
      makeSession("a", "2026-11-12T08:00:00Z", { evaluation_status: "done", total_score: 78 }),
      makeSession("a", "2026-11-10T08:00:00Z", { evaluation_status: "done", total_score: 60 }),
    ]);
    assert.equal(stats.get("a")?.lastScore, 78);
  });
});

describe("filterCases", () => {
  const cases = catalogCases([
    makeCase("kid", { specialty: "Nhi" }, "child", 1),
    makeCase("adult", { specialty: "Ngoại" }, "adult", 2),
    makeCase("old", { specialty: "Nội" }, "elderly", 3),
  ]);
  const ids = (xs: { id: string }[]) => xs.map((c) => c.id);

  it("filters by group and specialty", () => {
    assert.deepEqual(ids(filterCases(cases, { ...EMPTY_FILTERS, group: "adult" }, null)), ["adult"]);
    assert.deepEqual(ids(filterCases(cases, { ...EMPTY_FILTERS, specialty: "Nhi" }, null)), ["kid"]);
    assert.deepEqual(ids(filterCases(cases, { ...EMPTY_FILTERS, group: "adult", specialty: "Nhi" }, null)), []);
    assert.deepEqual(ids(filterCases(cases, EMPTY_FILTERS, null)), ["kid", "adult", "old"]);
  });

  it("hides practised cases only when practice stats are known", () => {
    const practice = aggregatePractice([makeSession("kid", "2026-11-10T08:00:00Z")]);
    const f = { ...EMPTY_FILTERS, unpractised: true };
    assert.deepEqual(ids(filterCases(cases, f, practice)), ["adult", "old"]);
    assert.deepEqual(ids(filterCases(cases, f, null)), ["kid", "adult", "old"]);
  });
});

describe("formatting", () => {
  const units = { days: "{n} ngày", months: "{n} tháng", years: "{n} tuổi" };

  it("formats ages with Vietnamese units", () => {
    assert.equal(formatAge(18, "months", units), "18 tháng");
    assert.equal(formatAge(70, "years", units), "70 tuổi");
    assert.equal(formatAge(5, "weeks", units), "5 weeks");
  });

  it("maps codes with a generic fallback", () => {
    const roles = { mother: "Mẹ trả lời", self: "Người bệnh tự trả lời" };
    assert.equal(labelFor("mother", roles, "Người nhà trả lời"), "Mẹ trả lời");
    assert.equal(labelFor("grandmother", roles, "Người nhà trả lời"), "Người nhà trả lời");
  });

  it("reveal switch defaults to off", () => {
    assert.equal(parseReveal(null), false);
    assert.equal(parseReveal("true"), false);
    assert.equal(parseReveal("1"), true);
  });
});
