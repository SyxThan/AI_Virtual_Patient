// Run: npm test (node --test with native TypeScript type stripping).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { examTargetOf, foldTranscript, lastPatientLine, latestFindings } from "./examTurns.ts";

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
