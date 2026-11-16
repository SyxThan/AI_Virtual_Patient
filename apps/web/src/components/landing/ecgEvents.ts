/**
 * Tiny event channel between hero pieces (the start button, the sample
 * conversation) and the ECG monitor. The monitor changes its playback rate;
 * nothing else listens.
 */
export const ECG_EVENT = "avp:ecg";

export type EcgEventDetail =
  /** Hover on the start button: a steady faster rhythm while true. */
  | { kind: "hover"; on: boolean }
  /** A red flag in the sample conversation: a short burst. */
  | { kind: "boost"; ms: number };

export function emitEcg(detail: EcgEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<EcgEventDetail>(ECG_EVENT, { detail }));
}
