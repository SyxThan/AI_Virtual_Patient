// Run: npm test (node --test with native TypeScript type stripping; no extra deps).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXAM_REGIONS,
  HEAD_LIMITS,
  REGION_CELL,
  aspectDistanceFactor,
  blinkAt,
  headAngles,
  jawFromLevel,
  lesionTargets,
  nextBlinkDelay,
  parseFindings,
  regionIdOf,
} from "./avatarContract.ts";

describe("regionIdOf (contract §4)", () => {
  it("prefers extras.regionId", () => {
    assert.equal(regionIdOf("whatever", { regionId: "feet" }), "feet");
  });
  it("falls back to the collider_ node name", () => {
    for (const id of EXAM_REGIONS) assert.equal(regionIdOf(`collider_${id}`, {}), id);
  });
  it("rejects non-colliders and unknown regions", () => {
    assert.equal(regionIdOf("Child_HandL", { label: "Bàn tay" }), null);
    assert.equal(regionIdOf("collider_belly", undefined), null);
    assert.equal(regionIdOf("collider_feet", { regionId: "belly" }), "feet");
  });
});

describe("lesion layer (Hard Rule 1)", () => {
  it("reveals only regions whose finding is documented", () => {
    assert.deepEqual(lesionTargets({}), [0, 0, 0, 0]);
    const t = lesionTargets({ palm_hands: true, feet: false, mouth_throat: true });
    assert.equal(t[REGION_CELL.palm_hands], 1);
    assert.equal(t[REGION_CELL.mouth_throat], 1);
    assert.equal(t[REGION_CELL.feet], 0, "unknown (documented=false) never paints lesions");
    assert.equal(t[REGION_CELL.buttocks_knees], 0, "unexamined never paints lesions");
  });
  it("maps every region to a distinct atlas cell", () => {
    const cells = EXAM_REGIONS.map((r) => REGION_CELL[r]);
    assert.equal(new Set(cells).size, EXAM_REGIONS.length);
  });
});

describe("parseFindings", () => {
  it("keeps only valid region -> boolean pairs", () => {
    assert.deepEqual(parseFindings('{"feet":true,"belly":true,"palm_hands":"yes","mouth_throat":false}'), {
      feet: true,
      mouth_throat: false,
    });
  });
  it("survives junk", () => {
    assert.deepEqual(parseFindings(null), {});
    assert.deepEqual(parseFindings("not json"), {});
    assert.deepEqual(parseFindings("[1,2]"), {});
  });
});

describe("headAngles (contract §3.2 limits)", () => {
  const head = { x: 0, y: 1.5, z: 0 };
  it("looks straight ahead at a target in front", () => {
    const a = headAngles(head, { x: 0, y: 1.5, z: 3 });
    assert.ok(Math.abs(a.yaw) < 1e-9);
    assert.ok(Math.abs(a.pitch) < 1e-9);
  });
  it("turns toward +X and looks down at a low target", () => {
    const a = headAngles(head, { x: 1, y: 1.0, z: 2 });
    assert.ok(a.yaw > 0);
    assert.ok(a.pitch > 0);
  });
  it("clamps yaw and pitch", () => {
    const side = headAngles(head, { x: 10, y: 1.5, z: 0.1 });
    assert.equal(side.yaw, HEAD_LIMITS.yaw);
    const up = headAngles(head, { x: 0, y: 10, z: 0.5 });
    assert.equal(up.pitch, HEAD_LIMITS.pitchUp);
    const down = headAngles(head, { x: 0, y: -10, z: 0.5 });
    assert.equal(down.pitch, HEAD_LIMITS.pitchDown);
  });
});

describe("face animation helpers", () => {
  it("blink opens, closes, reopens", () => {
    assert.equal(blinkAt(-0.1), 0);
    assert.ok(Math.abs(blinkAt(0.08) - 1) < 1e-9);
    assert.equal(blinkAt(0.2), 0);
  });
  it("blink delays stay in a natural range", () => {
    for (const r of [0, 0.05, 0.12, 0.5, 0.999]) {
      const d = nextBlinkDelay(() => r);
      assert.ok(d >= 0.25 && d <= 5.5, `delay ${d}`);
    }
  });
  it("jaw is closed at silence and capped when loud", () => {
    assert.equal(jawFromLevel(0), 0);
    assert.equal(jawFromLevel(-1), 0);
    assert.ok(jawFromLevel(5) <= 0.85);
  });
});

describe("aspectDistanceFactor", () => {
  it("does not move the camera on wide stages", () => {
    assert.equal(aspectDistanceFactor(2), 1);
    assert.equal(aspectDistanceFactor(0), 1);
  });
  it("backs off on narrow stages", () => {
    assert.ok(aspectDistanceFactor(0.75) > aspectDistanceFactor(1.33));
    assert.ok(aspectDistanceFactor(1.33) > 1);
  });
});
