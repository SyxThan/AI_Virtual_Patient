// Run: npm test (node --test with native TypeScript type stripping).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { examTargetOf, foldTranscript, labelTable, lastPatientLine, latestFindings } from "./examTurns.ts";

const t = (turn_idx: number, speaker: string, text: string) => ({ turn_idx, speaker, text });

describe("examTargetOf (exam_service.py labels)", () => {
  it("recognises every backend label, with or without the case action", () => {
    assert.equal(examTargetOf("[Khám - lòng bàn tay]"), "palm_hands");
    assert.equal(examTargetOf("[Khám - lòng bàn chân] Ấn nhẹ"), "feet");
    assert.equal(examTargetOf("[Khám - miệng - họng]"), "mouth_throat");
    assert.equal(examTargetOf("[Khám - mông - đầu gối]"), "buttocks_knees");
    assert.equal(examTargetOf("[Khám - quan sát trẻ nằm yên]"), "observe_child");
  });
  it("leaves ordinary questions alone", () => {
    assert.equal(examTargetOf("Chào chị, bé bị sao ạ?"), null);
    assert.equal(examTargetOf("[Khám - bụng]"), null, "unknown label is not guessed");
  });
});

describe("foldTranscript", () => {
  const turns = [
    t(0, "student", "Bé sốt mấy ngày rồi chị?"),
    t(1, "patient", "Dạ hai ngày."),
    t(2, "student", "[Khám - lòng bàn tay]"),
    t(3, "system", "Nốt phỏng nước ở lòng bàn tay."),
    t(4, "student", "[Khám - lòng bàn chân]"),
  ];
  it("turns an exam pair into one event carrying the finding verbatim", () => {
    const items = foldTranscript(turns);
    assert.equal(items.length, 4);
    assert.deepEqual(items[2], {
      kind: "exam",
      key: "exam-2",
      target: "palm_hands",
      finding: "Nốt phỏng nước ở lòng bàn tay.",
      turnIdx: 2,
    });
  });
  it("keeps an exam whose result has not arrived yet", () => {
    const last = foldTranscript(turns).at(-1);
    assert.equal(last?.kind, "exam");
    assert.equal(last?.kind === "exam" && last.finding, null);
  });
  it("reports the latest finding per region and the mother's last line", () => {
    const more = [...turns, t(5, "system", "x"), t(6, "student", "[Khám - lòng bàn tay]"), t(7, "system", "Lần 2")];
    const f = latestFindings(more);
    assert.equal(f.palm_hands, "Lần 2");
    assert.equal(f.feet, "x");
    assert.equal(f.mouth_throat, undefined);
    assert.equal(lastPatientLine(more)?.text, "Dạ hai ngày.");
    assert.equal(lastPatientLine([]), null);
  });
});

describe("2D case regions (AVP-150)", () => {
  const labels = labelTable([
    { id: "test_chest", label: "Ngực (TEST)" },
    { id: "test_left_hand", label: "Bàn tay trái (TEST)" },
  ]);
  it("maps the backend's lowercased catalog label back to the hotspot id", () => {
    assert.equal(examTargetOf("[Khám - ngực (test)] Nghe vùng ngực", labels), "test_chest");
    assert.equal(examTargetOf("[Khám - bàn tay trái (test)]", labels), "test_left_hand");
  });
  it("does not read another case's labels", () => {
    assert.equal(examTargetOf("[Khám - lòng bàn tay]", labels), null);
    assert.equal(examTargetOf("[Khám - ngực (test)]"), null); // HFMD table by default
  });
  it("folds and reports findings per hotspot", () => {
    const turns = [t(0, "student", "[Khám - ngực (test)]"), t(1, "system", "Kết quả giả.")];
    assert.deepEqual(latestFindings(turns, labels), { test_chest: "Kết quả giả." });
    assert.equal(foldTranscript(turns, labels)[0].kind, "exam");
  });
});
