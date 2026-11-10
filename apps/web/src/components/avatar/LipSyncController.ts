/**
 * Amplitude-driven lip-sync (Slice 5-03, P1).
 *
 * Reads patient audio through an AnalyserNode and turns its RMS level into a
 * 0..1 "mouth open" value per frame. With no audio attached it decays to 0, so
 * the avatar simply keeps its mouth closed (harmless no-op). Voice (Slice 6) will
 * call `patientLipSync.attachMediaElement(audio)` or `attachAnalyser(node)`.
 */
export class LipSyncController {
  private analyser: AnalyserNode | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private smoothed = 0;

  /** Attach an analyser the caller already wired into its own audio graph. */
  attachAnalyser(analyser: AnalyserNode): void {
    this.analyser = analyser;
    this.buffer = new Float32Array(analyser.fftSize);
  }

  /**
   * Route an <audio> element through an analyser (and on to the speakers).
   * Browsers allow one MediaElementSource per element, so call this once per element.
   */
  attachMediaElement(element: HTMLMediaElement): void {
    this.context ??= new AudioContext();
    this.source?.disconnect();
    this.source = this.context.createMediaElementSource(element);
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 1024;
    this.source.connect(analyser);
    analyser.connect(this.context.destination);
    this.attachAnalyser(analyser);
  }

  detach(): void {
    this.source?.disconnect();
    this.source = null;
    this.analyser = null;
    this.buffer = null;
  }

  /** Smoothed mouth-open level in [0, 1]; call once per animation frame. */
  level(): number {
    if (!this.analyser || !this.buffer) {
      this.smoothed *= 0.8;
      return this.smoothed;
    }
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (const sample of this.buffer) sum += sample * sample;
    const rms = Math.sqrt(sum / this.buffer.length);
    this.smoothed = this.smoothed * 0.6 + Math.min(1, rms * 6) * 0.4;
    return this.smoothed;
  }
}

/** Shared controller for the patient's voice (one patient per workspace). */
export const patientLipSync = new LipSyncController();

/** Mouth mesh Y-scale for a level: 1 = closed, up to 4x when fully open. */
export function jawScaleFor(level: number): number {
  return 1 + Math.max(0, Math.min(1, level)) * 3;
}
