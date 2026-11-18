// Run: npm test (node --test with native TypeScript type stripping; no extra deps).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AudioPartQueue, type AudioClock, type DecodedAudio, type PlayableSource } from "./audioQueue.ts";

type Started = { id: number; at: number; stopped: boolean; out: unknown };

/** A fake AudioContext: part duration = first byte of the data (seconds);
 *  decode time = second byte (ms), so later parts can decode faster. */
function fakeClock(now = 10) {
  const started: Started[] = [];
  const clock: AudioClock & { now: number } = {
    now,
    get currentTime() {
      return this.now;
    },
    async decodeAudioData(data: ArrayBuffer): Promise<DecodedAudio> {
      const b = new Uint8Array(data);
      if (b[0] === 255) throw new Error("bad audio");
      await new Promise((r) => setTimeout(r, b[1] ?? 0));
      return { duration: b[0] };
    },
    createBufferSource(): PlayableSource {
      const rec: Started = { id: started.length, at: -1, stopped: false, out: null };
      return {
        buffer: null,
        connect(node: unknown) {
          rec.out = node;
          return node;
        },
        start(when?: number) {
          rec.at = when ?? 0;
          started.push(rec);
        },
        stop() {
          rec.stopped = true;
        },
        onended: null,
      };
    },
  };
  return { clock, started };
}

const part = (seconds: number, decodeMs = 0) => new Uint8Array([seconds, decodeMs]).buffer;
const OUT = { analyser: true };

describe("AudioPartQueue", () => {
  it("schedules parts back to back, in arrival order, even if a later part decodes faster", async () => {
    const { clock, started } = fakeClock(10);
    const q = new AudioPartQueue(() => ({ ctx: clock, out: OUT }));
    const a = q.enqueue(part(2, 20), true);
    const b = q.enqueue(part(1, 0), false);
    const c = q.enqueue(part(3, 5), false);
    await Promise.all([a, b, c]);
    assert.deepEqual(
      started.map((s) => s.at),
      [10, 12, 13],
    );
    assert.ok(started.every((s) => s.out === OUT)); // all through the lip-sync node
  });

  it("a part that arrives after the queue ran dry starts now, not in the past", async () => {
    const { clock, started } = fakeClock(10);
    const q = new AudioPartQueue(() => ({ ctx: clock, out: OUT }));
    await q.enqueue(part(1), true);
    clock.now = 20;
    await q.enqueue(part(1), false);
    assert.deepEqual(
      started.map((s) => s.at),
      [10, 20],
    );
  });

  it("a fresh reply cuts the old one and drops its parts still decoding", async () => {
    const { clock, started } = fakeClock(10);
    const q = new AudioPartQueue(() => ({ ctx: clock, out: OUT }));
    await q.enqueue(part(5), true);
    const late = q.enqueue(part(5, 30), false); // still decoding when the new reply comes
    const fresh = q.enqueue(part(1), true);
    await Promise.all([late, fresh]);
    assert.equal(started.length, 2);
    assert.equal(started[0].stopped, true);
    assert.equal(started[1].at, 10); // the new reply starts now, not after the old one
  });

  it("cut stops everything scheduled", async () => {
    const { clock, started } = fakeClock(0);
    const q = new AudioPartQueue(() => ({ ctx: clock, out: OUT }));
    await q.enqueue(part(1), true);
    await q.enqueue(part(1), false);
    q.cut();
    assert.ok(started.every((s) => s.stopped));
    assert.equal(q.scheduled, 0);
  });

  it("a part that fails to decode reports once and does not block later parts", async () => {
    const { clock, started } = fakeClock(0);
    let errors = 0;
    const q = new AudioPartQueue(
      () => ({ ctx: clock, out: OUT }),
      () => errors++,
    );
    await q.enqueue(part(1), true);
    await q.enqueue(new Uint8Array([255, 0]).buffer, false);
    await q.enqueue(part(1), false);
    assert.equal(errors, 1);
    assert.deepEqual(
      started.map((s) => s.at),
      [0, 1],
    );
  });

  it("without audio output nothing plays and nothing throws", async () => {
    const q = new AudioPartQueue(() => null);
    await q.enqueue(part(1), true);
    assert.equal(q.scheduled, 0);
  });
});
