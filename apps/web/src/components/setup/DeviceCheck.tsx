"use client";

import type { RefObject } from "react";
import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";
import type { MicState, PreloadState, WebglState } from "./useDeviceCheck";

const d = vi.setupUx.device;

const LINK_BTN = `inline-flex min-h-11 items-center rounded-control px-2 text-sm font-semibold text-primary underline-offset-4 hover:bg-primary-soft hover:underline ${FOCUS_RING}`;
const SOFT_BTN = `inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:border-ink/40 hover:bg-canvas ${FOCUS_RING}`;

/**
 * Step 3. Two rows of fixed height so state changes never move the layout:
 * the 3D model (WebGL probe + preload with a thin bar driven by real download
 * progress) and the microphone (tested only when the learner asks).
 */
export default function DeviceCheck({
  webgl,
  preload,
  mic,
  micRunning,
  meterRef,
  onMicTest,
  onMicStop,
  onMicSkip,
}: {
  webgl: WebglState;
  preload: PreloadState;
  mic: MicState;
  micRunning: boolean;
  meterRef: RefObject<HTMLDivElement | null>;
  onMicTest: () => void;
  onMicStop: () => void;
  onMicSkip: () => void;
}) {
  const pct = Math.round(preload.fraction * 100);
  const modelText =
    webgl === "checking"
      ? d.checking
      : webgl === "unsupported"
        ? d.noWebgl
        : preload.phase === "ready"
          ? d.ready
          : preload.phase === "failed"
            ? d.failed
            : preload.phase === "waiting"
              ? d.waiting
              : d.loading.replace("{pct}", String(pct));
  const modelOk = webgl === "ok" && preload.phase === "ready";
  const modelBad = webgl === "unsupported";

  const micNote =
    mic === "denied"
      ? d.micDenied
      : mic === "missing"
        ? d.micMissing
        : mic === "unsupported"
          ? d.micUnsupported
          : mic === "error"
            ? d.micError
            : mic === "skipped"
              ? d.micSkipped
              : null;

  return (
    <div className="flex flex-col gap-2">
      {/* ---------------------------------------------------------- 3D model */}
      <div id="device-model" className="rounded-control bg-canvas px-3.5 py-2">
        <div className="flex items-center gap-3">
          <StatusDot tone={modelOk ? "ok" : modelBad ? "bad" : "busy"} />
          <span className="text-sm font-semibold text-ink">{d.model}</span>
          <span className="min-w-0 truncate text-sm text-ink-muted" aria-live="polite">
            {modelBad ? null : modelText}
          </span>
        </div>
        {/* Thin bar: always present (no layout shift), fills with the real download fraction. */}
        <div
          role="progressbar"
          aria-label={d.progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={modelBad ? 0 : pct}
          className={`mt-1.5 h-1 overflow-hidden rounded-full bg-line ${modelBad ? "hidden" : ""}`}
        >
          <div
            className={`h-full origin-left rounded-full transition-transform duration-200 ${modelOk ? "bg-success" : "bg-primary"}`}
            style={{ transform: `scaleX(${modelOk ? 1 : preload.fraction})` }}
          />
        </div>
        {modelBad && (
          <div role="alert" className="mt-2 text-sm leading-relaxed text-ink">
            <p className="font-semibold text-danger">{d.noWebgl}</p>
            <p className="mt-1">{d.noWebglFix}</p>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------- microphone */}
      <div className="rounded-control bg-canvas px-3.5 py-1">
        <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
          <StatusDot tone={mic === "ok" || mic === "skipped" ? "ok" : micNote ? "warn" : "idle"} />
          <span className="text-sm font-semibold text-ink">{d.mic}</span>

          {/* Meter: 5 segments lit by the live level (written directly by useMicCheck). */}
          <div
            ref={meterRef}
            role="img"
            aria-label={d.micLevel}
            className={`flex items-end gap-1 ${micRunning ? "" : "opacity-40"}`}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                data-seg
                data-on="false"
                className="w-1.5 rounded-sm bg-line-strong transition-colors duration-75 data-[on=true]:bg-primary"
                style={{ height: `${8 + i * 3}px` }}
              />
            ))}
          </div>

          <span className="ml-auto flex items-center gap-1">
            {(mic === "idle" || mic === "requesting" || mic === "listening") && (
              <button type="button" onClick={onMicSkip} className={LINK_BTN}>
                {d.micSkip}
              </button>
            )}
            {micRunning ? (
              <button type="button" onClick={onMicStop} className={SOFT_BTN}>
                {d.micStop}
              </button>
            ) : (
              <button
                type="button"
                onClick={onMicTest}
                disabled={mic === "requesting"}
                className={`${SOFT_BTN} disabled:opacity-60`}
              >
                <MicIcon />
                {mic === "idle" || mic === "skipped" || mic === "requesting" ? d.micTest : d.micRetest}
              </button>
            )}
          </span>
        </div>

        <p aria-live="polite" className="pb-1.5 text-sm leading-snug text-ink-muted empty:hidden">
          {mic === "requesting"
            ? d.micRequesting
            : mic === "listening"
              ? d.micSay
              : mic === "ok"
                ? d.micOk
                : micNote}
        </p>
      </div>
    </div>
  );
}

function StatusDot({ tone }: { tone: "ok" | "bad" | "busy" | "warn" | "idle" }) {
  const cls =
    tone === "ok"
      ? "bg-success"
      : tone === "bad"
        ? "bg-danger"
        : tone === "warn"
          ? "bg-warning"
          : tone === "busy"
            ? "bg-primary animate-pulse motion-reduce:animate-none"
            : "bg-line-strong";
  return <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} />;
}

function MicIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <rect x="7" y="2.5" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
