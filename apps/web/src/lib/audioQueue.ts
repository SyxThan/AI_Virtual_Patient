/**
 * Gapless playback of a reply that arrives in parts (AVP-167).
 *
 * The voice WebSocket streams a patient reply as `audio` parts 0, 1, 2 ...
 * Each part is decoded in arrival order and scheduled right after the previous
 * one on the AudioContext clock, so playback starts with the first part and the
 * parts join without gaps. `fresh` (part 0, or a whole reply from an older
 * server or the typed-turn speech endpoint) cuts whatever is still playing.
 * Every source connects to the same output node (the lip-sync AnalyserNode).
 *
 * Plain class with structural types so it runs under `node --test` with fakes.
 */

export type DecodedAudio = { duration: number };
export type PlayableSource = {
  buffer: DecodedAudio | null;
  connect(node: unknown): unknown;
  start(when?: number): void;
  stop(): void;
  onended: (() => void) | null;
};
export type AudioClock = {
  readonly currentTime: number;
  decodeAudioData(data: ArrayBuffer): Promise<DecodedAudio>;
  createBufferSource(): PlayableSource;
};

export class AudioPartQueue {
  private playing = new Set<PlayableSource>();
  private nextStart = 0;
  private chain: Promise<void> = Promise.resolve();
  private gen = 0;
  private readonly target: () => { ctx: AudioClock; out: unknown } | null;
  private readonly onError: () => void;

  // Plain fields, not parameter properties: node --test only strips types.
  constructor(target: () => { ctx: AudioClock; out: unknown } | null, onError: () => void = () => undefined) {
    this.target = target;
    this.onError = onError;
  }

  /** Stop every scheduled part and drop parts still decoding. */
  cut(): void {
    this.gen++;
    for (const src of this.playing) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.playing.clear();
    this.nextStart = 0;
    this.chain = Promise.resolve();
  }

  /** Queue one part; resolves once it is scheduled (or dropped). */
  enqueue(data: ArrayBuffer, fresh: boolean): Promise<void> {
    if (fresh) this.cut();
    const gen = this.gen;
    const run = this.chain.then(async () => {
      const t = this.target();
      if (!t) return;
      try {
        const buffer = await t.ctx.decodeAudioData(data);
        if (gen !== this.gen) return; // stopped or superseded while decoding
        const src = t.ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(t.out);
        const at = Math.max(t.ctx.currentTime, this.nextStart);
        src.start(at);
        this.nextStart = at + buffer.duration;
        this.playing.add(src);
        src.onended = () => this.playing.delete(src);
      } catch {
        if (gen === this.gen) this.onError();
      }
    });
    this.chain = run;
    return run;
  }

  /** Parts scheduled and not yet ended (for tests and diagnostics). */
  get scheduled(): number {
    return this.playing.size;
  }
}
