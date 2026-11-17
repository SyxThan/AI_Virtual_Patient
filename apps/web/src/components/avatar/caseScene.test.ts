// Run: npm test (node --test with native TypeScript type stripping; no extra deps).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BASE_ORBIT,
  CaseSceneError,
  HFMD_CASE_ID,
  MAX_REG,
  OVERLAY_TYPES,
  breathWeight,
  checkSceneMeta,
  colliderExtrasOf,
  lookAxisAngle,
  orbitLimitsFor,
  parseCaseScene,
  parseOverlay,
  parseRegionFindings,
  regionOrder,
  revealTargets,
  sceneUrlFor,
  skinLayout,
  sphericalOf,
  stageSourceOf,
  type ColliderExtras,
} from "./caseScene.ts";

const DENGUE = {
  contract: "avp-case-scene/1",
  caseId: "case-02-dengue",
  model: "/models/case-02-dengue.glb",
  speakerLabel: "Mẹ",
  draft: true,
  camera: {
    home: { pos: [3.3, 2.5, 4.6], target: [-0.35, 0.8, -0.25] },
    exam: { pos: [1.45, 1.75, 1.45], target: [0.3, 0.6, -0.42] },
  },
  regions: [
    { id: "hands_perfusion", overlays: [] },
    { id: "legs_skin", overlays: [{ type: "petechiae", p1: 190, p2: 0.16, color: "#8e1b2c", strength: 1 }] },
    {
      id: "abdomen",
      overlays: [
        { type: "edge", landmark: "liver_edge", axis: [-0.12, 0, -1], normal: [0, 1, 0], p1: 0.075, p2: 0.006, dash: 55, color: "#7a3b8f", strength: 0.9 },
        { type: "focus", landmark: "right_upper_quadrant", p1: 0.05, p2: 0.006, color: "#e0644f", strength: 0.8 },
      ],
    },
  ],
};

describe("stage source", () => {
  it("keeps HFMD on the Slice 16 scene", () => {
    assert.deepEqual(stageSourceOf(HFMD_CASE_ID), { kind: "hfmd" });
    assert.deepEqual(stageSourceOf("case-02-dengue"), { kind: "case", caseId: "case-02-dengue" });
    assert.equal(sceneUrlFor("case-02-dengue"), "/models/case-02-dengue.scene.json");
  });
});

describe("parseCaseScene", () => {
  it("reads the documented format", () => {
    const c = parseCaseScene(DENGUE, "case-02-dengue");
    assert.equal(c.model, "/models/case-02-dengue.glb");
    assert.equal(c.speakerLabel, "Mẹ");
    assert.equal(c.draft, true);
    assert.deepEqual(c.camera.exam, { pos: [1.45, 1.75, 1.45], target: [0.3, 0.6, -0.42] });
    assert.equal(c.breathing, null);
    assert.equal(c.overlays.legs_skin.length, 1);
    assert.equal(c.overlays.abdomen.length, 2);
    assert.deepEqual(c.overlays.hands_perfusion, []);
  });
  it("rejects another contract, another case, or a remote model", () => {
    assert.throws(() => parseCaseScene({ ...DENGUE, contract: "avp-case-scene/2" }, "case-02-dengue"), CaseSceneError);
    assert.throws(() => parseCaseScene(DENGUE, "case-03-pneumonia"), CaseSceneError);
    assert.throws(() => parseCaseScene({ ...DENGUE, model: "https://evil.example/x.glb" }, "case-02-dengue"), CaseSceneError);
    assert.throws(() => parseCaseScene({ ...DENGUE, model: "/models/../secret.glb" }, "case-02-dengue"), CaseSceneError);
    assert.throws(() => parseCaseScene(null, "case-02-dengue"), CaseSceneError);
  });
  it("keeps breathing morph/rate/amplitude only, within bounds", () => {
    const c = parseCaseScene(
      { ...DENGUE, breathing: { morph: "breathIn", rate: 52, amplitude: 1.0, note: "free text" } },
      "case-02-dengue",
    );
    assert.deepEqual(c.breathing, { morph: "breathIn", rate: 52, amplitude: 1 });
    assert.equal(parseCaseScene({ ...DENGUE, breathing: { morph: "breathIn", rate: 0 } }, "case-02-dengue").breathing, null);
    assert.equal(parseCaseScene({ ...DENGUE, breathing: { morph: "breathIn", rate: 500 } }, "case-02-dengue").breathing, null);
  });
  it("drops invalid region ids and unknown overlay types", () => {
    const c = parseCaseScene(
      { ...DENGUE, regions: [{ id: "Bad Id", overlays: [] }, { id: "chest", overlays: [{ type: "laser" }, { type: "tint", color: "#334455" }] }] },
      "case-02-dengue",
    );
    assert.deepEqual(Object.keys(c.overlays), ["chest"]);
    assert.equal(c.overlays.chest.length, 1);
    assert.equal(c.overlays.chest[0].type, "tint");
  });
});

describe("parseOverlay", () => {
  it("needs a landmark for focus and edge", () => {
    assert.equal(parseOverlay({ type: "focus", p1: 0.05 }), null);
    assert.equal(parseOverlay({ type: "edge" }), null);
    assert.ok(parseOverlay({ type: "focus", landmark: "mcburney" }));
  });
  it("normalises vectors and clamps strength, defaults the colour", () => {
    const o = parseOverlay({ type: "edge", landmark: "x", axis: [0, 0, -2], strength: 3, color: "red" });
    assert.ok(o);
    assert.deepEqual(o.axis, [0, 0, -1]);
    assert.equal(o.strength, 1);
    assert.equal(o.color, "#c0303a");
  });
});

describe("checkSceneMeta (scene extras)", () => {
  const meta = { contract: "avp-case-scene/1", caseId: "case-02-dengue", regions: ["abdomen", "chest"], skinMaterial: "patient_skin" };
  it("returns region order and skin material", () => {
    assert.deepEqual(checkSceneMeta(meta, "case-02-dengue"), { regions: ["abdomen", "chest"], skinMaterial: "patient_skin" });
  });
  it("throws on a contract or case mismatch", () => {
    assert.throws(() => checkSceneMeta({ ...meta, caseId: "case-04-appendicitis" }, "case-02-dengue"), CaseSceneError);
    assert.throws(() => checkSceneMeta({}, "case-02-dengue"), CaseSceneError);
    assert.throws(() => checkSceneMeta(undefined, "case-02-dengue"), CaseSceneError);
  });
});

describe("colliderExtrasOf", () => {
  it("reads regionId, atlasCell, boxes and viewDir", () => {
    const ex = colliderExtrasOf("collider_hands_perfusion", {
      regionId: "hands_perfusion",
      atlasCell: 0,
      viewDir: [0.13, 0.869, 0.478],
      boxes: [[0.37, 0.524, -0.774, 0.484, 0.614, -0.654], [1, 2, 3], "x"],
    });
    assert.ok(ex);
    assert.equal(ex.regionId, "hands_perfusion");
    assert.equal(ex.atlasCell, 0);
    assert.equal(ex.boxes.length, 1);
    assert.ok(ex.viewDir && Math.abs(Math.hypot(...ex.viewDir) - 1) < 1e-9);
  });
  it("falls back to the node name and treats a bad cell as clothing", () => {
    const ex = colliderExtrasOf("collider_chest", { atlasCell: 9 });
    assert.equal(ex?.regionId, "chest");
    assert.equal(ex?.atlasCell, -1);
    assert.equal(colliderExtrasOf("Child_HandL", { label: "Bàn tay" }), null);
  });
});

describe("regionOrder", () => {
  it("keeps scene order, only catalog ids with a collider, at most MAX_REG", () => {
    const order = regionOrder(
      ["hands_perfusion", "legs_skin", "mouth_nose", "abdomen"],
      ["abdomen", "legs_skin", "hands_perfusion", "vitals", "general"],
      new Set(["hands_perfusion", "legs_skin", "mouth_nose", "abdomen"]),
    );
    assert.deepEqual(order, ["hands_perfusion", "legs_skin", "abdomen"]);
    const many = Array.from({ length: 12 }, (_, i) => `r${i}`);
    assert.equal(regionOrder(many, many, new Set(many)).length, MAX_REG);
  });
});

describe("skinLayout", () => {
  const extras = new Map<string, ColliderExtras>([
    ["legs_skin", { regionId: "legs_skin", atlasCell: 3, boxes: [[0, 0, 0, 1, 1, 1]], viewDir: null }],
    ["abdomen", { regionId: "abdomen", atlasCell: 4, boxes: [[0, 0, 0, 1, 1, 1], [2, 2, 2, 3, 3, 3]], viewDir: null }],
  ]);
  const scene = parseCaseScene(DENGUE, "case-02-dengue");
  it("maps cells, boxes and overlays onto region slots", () => {
    const l = skinLayout(["legs_skin", "abdomen"], extras, scene.overlays, {
      liver_edge: [0.1, 0.7, -0.3],
      right_upper_quadrant: [0.12, 0.7, -0.32],
    });
    assert.deepEqual(l.cells.slice(0, 3), [3, 4, -1]);
    assert.deepEqual(l.boxes.map((b) => b.region), [0, 1, 1]);
    assert.deepEqual(l.overlays.map((o) => [o.code, o.region]), [
      [OVERLAY_TYPES.petechiae, 0],
      [OVERLAY_TYPES.edge, 1],
      [OVERLAY_TYPES.focus, 1],
    ]);
    assert.deepEqual(l.overlays[1].centre, [0.1, 0.7, -0.3]);
  });
  it("skips a focus/edge overlay whose landmark is missing from the model", () => {
    const l = skinLayout(["abdomen"], extras, scene.overlays, {});
    assert.equal(l.overlays.length, 0);
  });
});

describe("revealTargets (Hard Rule 1)", () => {
  it("shows a layer only for an examined region with a documented finding", () => {
    assert.deepEqual(revealTargets(["a", "b", "c"], { a: true, b: false }).slice(0, 3), [1, 0, 0]);
  });
});

describe("breathWeight", () => {
  it("inhales over 45% of the cycle, rests after, scales with amplitude", () => {
    const period = 60 / 52;
    assert.equal(breathWeight(0, 52, 1), 0);
    assert.ok(Math.abs(breathWeight(period * 0.225, 52, 1) - 1) < 1e-9);
    assert.ok(Math.abs(breathWeight(period * 0.225, 52, 0.5) - 0.5) < 1e-9);
    assert.equal(breathWeight(period * 0.7, 52, 1), 0);
    assert.equal(breathWeight(1, 0, 1), 0);
  });
});

describe("lookAxisAngle", () => {
  it("is clamped to 35° around the face axis, for a lying speaker too", () => {
    const up = lookAxisAngle([0.05, 0.9988, 0], [0, 0, 1]);
    assert.ok(Math.abs(up.angle - (35 * Math.PI) / 180) < 1e-9);
    const small = lookAxisAngle([0, 0, 1], [Math.sin(0.2), 0, Math.cos(0.2)]);
    assert.ok(Math.abs(small.angle - 0.2) < 1e-9);
    assert.ok(Math.abs(small.axis[1] - 1) < 1e-9);
    assert.equal(lookAxisAngle([0, 0, 1], [0, 0, 5]).angle, 0);
  });
});

describe("orbitLimitsFor", () => {
  it("keeps the Slice 16 limits when every direction already fits", () => {
    assert.deepEqual(orbitLimitsFor([[0.3, 0.2, 1]]), BASE_ORBIT);
  });
  it("widens just enough for an authored viewDir from the left or from above", () => {
    const dir = [-0.66, 0.264, 0.704] as const;
    const lim = orbitLimitsFor([dir, [0.087, 0.873, 0.48]]);
    assert.ok(lim.minAzimuth < sphericalOf(dir).azimuth);
    assert.ok(lim.minAzimuth >= -1.4);
    assert.ok(lim.minPolar < sphericalOf([0.087, 0.873, 0.48]).polar);
    assert.equal(lim.maxPolar, BASE_ORBIT.maxPolar);
  });
});

describe("parseRegionFindings", () => {
  it("keeps any hotspot id with a boolean, drops junk", () => {
    assert.deepEqual(parseRegionFindings('{"legs_skin":true,"vitals":false,"Bad Key":true,"x":1}'), {
      legs_skin: true,
      vitals: false,
    });
    assert.deepEqual(parseRegionFindings("not json"), {});
    assert.deepEqual(parseRegionFindings(null), {});
  });
});
