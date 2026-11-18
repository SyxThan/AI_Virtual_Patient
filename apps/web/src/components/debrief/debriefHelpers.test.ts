// Run: npm test (node --test with native TypeScript type stripping).
// Synthetic criteria only (no real transcripts or rubric text).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countByFilter,
  criterionAnchor,
  defaultFilter,
  domainSummary,
  groupByDomain,
  isCriticalMiss,
  matchesFilter,
  splitClaims,
  type Claim,
} from "./debriefHelpers.ts";

type C = { criterion_id: string; domain?: string | null; status: "met" | "partial" | "unmet" | "insufficient_evidence"; critical: boolean };
const c = (criterion_id: string, domain: string | null, status: C["status"], critical = false): C => ({
  criterion_id,
  domain,
  status,
  critical,
});

describe("groupByDomain", () => {
  it("orders domains by interview order and puts unknown domains last", () => {
    const groups = groupByDomain([
      c("a", "communication", "met"),
      c("b", "weird", "unmet"),
      c("d", "history", "met"),
      c("e", null, "met"),
    ]);
    assert.deepEqual(
      groups.map((g) => g.key),
      ["history", "communication", "other"],
    );
    assert.deepEqual(
      groups[2].items.map((x) => x.criterion_id),
      ["b", "e"],
    );
  });

  it("puts critical misses first, then unmet, insufficient, partial, met; stable otherwise", () => {
    const [g] = groupByDomain([
      c("met1", "history", "met"),
      c("part", "history", "partial"),
      c("ins", "history", "insufficient_evidence"),
      c("un1", "history", "unmet"),
      c("crit", "history", "insufficient_evidence", true),
      c("un2", "history", "unmet"),
    ]);
    assert.deepEqual(
      g.items.map((x) => x.criterion_id),
      ["crit", "un1", "un2", "ins", "part", "met1"],
    );
  });
});

describe("filters", () => {
  const list = [c("1", "history", "met"), c("2", "history", "partial"), c("3", "history", "unmet")];
  it("counts missed (anything not met) and met", () => {
    assert.deepEqual(countByFilter(list), { all: 3, missed: 2, met: 1 });
  });
  it("matches each filter", () => {
    assert.equal(matchesFilter(list[1], "missed"), true);
    assert.equal(matchesFilter(list[1], "met"), false);
    assert.equal(matchesFilter(list[0], "met"), true);
    assert.equal(matchesFilter(list[0], "all"), true);
  });
  it("starts on the gaps, or on everything when all criteria are met", () => {
    assert.equal(defaultFilter(list), "missed");
    assert.equal(defaultFilter([list[0]]), "all");
    assert.equal(defaultFilter([]), "all");
  });
});

describe("isCriticalMiss", () => {
  it("is true only for a critical criterion that is unmet or lacks evidence", () => {
    assert.equal(isCriticalMiss(c("x", null, "unmet", true)), true);
    assert.equal(isCriticalMiss(c("x", null, "insufficient_evidence", true)), true);
    assert.equal(isCriticalMiss(c("x", null, "partial", true)), false);
    assert.equal(isCriticalMiss(c("x", null, "unmet", false)), false);
  });
});

describe("domainSummary", () => {
  it("tallies met per domain and keeps rubric order inside", () => {
    const s = domainSummary([c("1", "history", "unmet"), c("2", "physical_exam", "met"), c("3", "history", "met")]);
    assert.deepEqual(
      s.map((d) => [d.key, d.met, d.total, d.items.map((x) => x.criterion_id).join("")]),
      [
        ["history", 1, 2, "13"],
        ["physical_exam", 1, 1, "2"],
      ],
    );
  });
});

describe("splitClaims", () => {
  it("attaches claims to known criteria and keeps the rest as general", () => {
    const claims: Claim[] = [
      { text: "a", criterion_id: "k1", verified: true },
      { text: "b", criterion_id: "zz", verified: false },
      { text: "c", criterion_id: null, verified: false },
      { text: "d", criterion_id: "k1", verified: false },
    ];
    const { byCriterion, general } = splitClaims(claims, ["k1", "k2"]);
    assert.deepEqual(
      byCriterion.get("k1")?.map((x) => x.text),
      ["a", "d"],
    );
    assert.equal(byCriterion.has("k2"), false);
    assert.deepEqual(
      general.map((x) => x.text),
      ["b", "c"],
    );
  });
});

describe("criterionAnchor", () => {
  it("makes a hash-safe id", () => {
    assert.equal(criterionAnchor("hx-01"), "crit-hx-01");
    assert.equal(criterionAnchor("a b/c#d"), "crit-a_b_c_d");
  });
});
