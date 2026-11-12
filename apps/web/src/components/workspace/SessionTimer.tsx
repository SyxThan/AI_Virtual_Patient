"use client";

import { useEffect, useRef, useState } from "react";
import vi from "../../../messages/vi.json";

function format(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Session clock. Without a limit it counts up from `startedAtMs`; with
 * `limitS` (exam mode, configured) it counts down and calls `onExpire` once at
 * zero. `offsetMs` is server time minus local time, so a wrong local clock does
 * not shift the countdown. The 5- and 1-minute warnings go to a polite live
 * region; the ticking value itself is not announced every second.
 */
export default function SessionTimer({
  startedAtMs,
  offsetMs,
  limitS,
  onExpire,
}: {
  startedAtMs: number;
  offsetMs: number;
  limitS: number | null;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const expiredRef = useRef(false);
  const warnedRef = useRef<Set<number>>(new Set());
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const tick = () => {
      const t = Date.now() + offsetMs;
      setNow(t);
      if (limitS === null) return;
      const remaining = limitS - (t - startedAtMs) / 1000;
      for (const [mark, text] of [
        [300, vi.workspace.timer.warn5],
        [60, vi.workspace.timer.warn1],
      ] as const) {
        if (remaining <= mark && remaining > 0 && limitS > mark && !warnedRef.current.has(mark)) {
          warnedRef.current.add(mark);
          setAnnounce(text);
        }
      }
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAtMs, offsetMs, limitS]);

  const elapsedS = now === null ? 0 : (now - startedAtMs) / 1000;
  const countdown = limitS !== null;
  const shown = countdown ? limitS - elapsedS : elapsedS;
  const low = countdown && shown <= 60;
  const label = countdown ? vi.workspace.timer.remaining : vi.workspace.timer.elapsed;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-700">{label}</span>
      <span
        role="timer"
        aria-label={label}
        className={`rounded-md px-2 py-0.5 font-mono font-semibold tabular-nums ${
          low ? "bg-red-100 text-red-900" : "bg-gray-100 text-gray-900"
        }`}
      >
        {now === null ? "--:--" : format(shown)}
      </span>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
