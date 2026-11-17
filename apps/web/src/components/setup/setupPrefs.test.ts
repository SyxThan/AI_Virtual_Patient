// Run: npm test (node --test with native TypeScript type stripping).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PREFS, enterStartsSession, parsePrefs, serializePrefs } from "./setupPrefs.ts";

describe("parsePrefs", () => {
  it("returns defaults for nothing or garbage", () => {
    assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
    assert.deepEqual(parsePrefs("not json"), DEFAULT_PREFS);
    assert.deepEqual(parsePrefs("42"), DEFAULT_PREFS);
  });

  it("keeps valid fields and replaces unknown ones", () => {
    assert.deepEqual(parsePrefs('{"role":"resident","mode":"exam"}'), { role: "resident", mode: "exam" });
    assert.deepEqual(parsePrefs('{"role":"admin","mode":"exam"}'), { role: "student", mode: "exam" });
  });

  it("never restores consent", () => {
    const stored = serializePrefs({ role: "practitioner", mode: "guided", consent: true } as never);
    assert.equal(stored.includes("consent"), false);
    assert.equal("consent" in parsePrefs('{"role":"resident","consent":true}'), false);
  });
});

describe("enterStartsSession", () => {
  it("starts from the page body or plain text", () => {
    assert.equal(enterStartsSession(null), true);
    assert.equal(enterStartsSession({ tagName: "BODY" }), true);
    assert.equal(enterStartsSession({ tagName: "div" }), true);
  });

  it("leaves Enter to fields, buttons and links", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]) {
      assert.equal(enterStartsSession({ tagName: tag }), false, tag);
    }
    assert.equal(enterStartsSession({ tagName: "DIV", isContentEditable: true }), false);
  });
});
