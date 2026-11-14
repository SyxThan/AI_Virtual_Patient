"use client";

import { useCallback, useEffect, useState } from "react";
import vi from "../../../messages/vi.json";
import { buttonClass } from "@/components/ui/Button";
import Tile from "@/components/ui/Tile";
import { FOCUS_RING_DARK } from "@/components/ui/focus";
import { API_URL, authHeaders, fmt, whenAuthReady } from "@/lib/sessionAuth";

type Vitals = {
  temperature_c: number;
  heart_rate_bpm: number;
  respiratory_rate_bpm: number;
  blood_pressure_sys: number;
  blood_pressure_dia: number;
  spo2_percent: number;
  clinical_state: string;
  clinical_label: string;
  active_symptoms: string[];
};

/**
 * Bedside monitor. Values come from the vitals state machine (draft scenario,
 * Hard rule 2). Threshold alerts are also mirrored into a polite live region so
 * screen-reader users hear them (TASK-S12-04). `disabled` freezes the buttons
 * once the session can no longer be acted on (time limit reached).
 */
export default function VitalsMonitor({
  sessionId,
  disabled = false,
}: {
  sessionId: string;
  disabled?: boolean;
}) {
  const [v, setV] = useState<Vitals | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const measure = useCallback(async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${sessionId}/vitals`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      setV(await res.json());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  const sendEvent = useCallback(
    async (event: string) => {
      setBusy(true);
      setError(false);
      try {
        const res = await fetch(`${API_URL}/api/v1/sessions/${sessionId}/vitals/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ event }),
        });
        if (!res.ok) throw new Error();
        setV(await res.json());
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await whenAuthReady();
        const res = await fetch(`${API_URL}/api/v1/sessions/${sessionId}/vitals`, {
          headers: authHeaders(),
        });
        if (res.ok && !cancelled) setV(await res.json());
        else if (!cancelled) setError(true);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const feverHigh = (v?.temperature_c ?? 0) >= 39.0;
  const hrHigh = (v?.heart_rate_bpm ?? 0) > 150;
  const spo2Low = (v?.spo2_percent ?? 100) < 95;
  const alerts = [
    feverHigh && vi.monitor.feverWarning,
    hrHigh && vi.a11y.hrHigh,
    spo2Low && vi.a11y.spo2Low,
  ].filter(Boolean) as string[];

  return (
    <Tile as="section" tone="ink" compact aria-labelledby="vitals-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="vitals-title" className="flex items-center gap-2 text-base font-bold text-white">
          <svg viewBox="0 0 20 20" className="h-5 w-5 text-primary-soft" fill="none" aria-hidden="true">
            <path
              d="M2 10.5h3.5l2-4.5 3 9 2.5-6 1.5 1.5H18"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {vi.monitor.title}
        </h2>
        {v && (
          <span className="rounded-full border border-ink-inverse-muted/40 px-3 py-1 text-sm font-semibold text-white">
            {v.clinical_label}
          </span>
        )}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {alerts.length > 0 ? fmt(vi.a11y.vitalsAlert, { alerts: alerts.join(", ") }) : ""}
      </p>
      {error && (
        <p role="alert" className="mb-3 rounded-control bg-warning-soft px-3 py-2 text-sm text-ink">
          {vi.monitor.error}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        <Metric
          label={vi.monitor.hr}
          value={v ? `${v.heart_rate_bpm}` : "—"}
          unit={vi.monitor.unitBpm}
          pulse={!!v}
          warn={hrHigh}
          warnText={vi.a11y.hrHigh}
        />
        <Metric
          label={vi.monitor.temp}
          value={v ? v.temperature_c.toFixed(1) : "—"}
          unit="°C"
          warn={feverHigh}
          warnText={vi.monitor.feverWarning}
        />
        <Metric
          label={vi.monitor.rr}
          value={v ? `${v.respiratory_rate_bpm}` : "—"}
          unit={vi.monitor.unitBpm}
        />
        <Metric
          label={vi.monitor.bp}
          value={v ? `${v.blood_pressure_sys}/${v.blood_pressure_dia}` : "—"}
          unit="mmHg"
        />
        <Metric
          label={vi.monitor.spo2}
          value={v ? `${v.spo2_percent}` : "—"}
          unit="%"
          warn={spo2Low}
          warnText={vi.a11y.spo2Low}
        />
      </dl>

      {v && v.active_symptoms.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-ink-inverse-muted">{vi.monitor.symptoms}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {v.active_symptoms.map((s) => (
              <li key={s} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={measure}
          disabled={busy || disabled}
          className={buttonClass({ variant: "inverse" })}
        >
          {busy ? vi.monitor.loading : vi.monitor.measure}
        </button>
        <button
          type="button"
          onClick={() => sendEvent("ORDER_ANTIPYRETIC")}
          disabled={busy || disabled}
          className={`inline-flex h-11 items-center justify-center rounded-control border border-ink-inverse-muted/50 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING_DARK}`}
        >
          {vi.monitor.antipyretic}
        </button>
      </div>
    </Tile>
  );
}

/** One monitor reading. An out-of-range value is flagged with text, not color alone. */
function Metric({
  pulse,
  label,
  value,
  unit,
  warn,
  warnText,
}: {
  pulse?: boolean;
  label: string;
  value: string;
  unit: string;
  warn?: boolean;
  warnText?: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col rounded-card border p-3 ${
        warn ? "border-warning-soft bg-white/10" : "border-white/10 bg-white/5"
      }`}
    >
      <dt className="flex items-center gap-1.5 text-sm text-ink-inverse-muted">
        {label}
        {pulse && (
          <span
            className="ml-auto h-2 w-2 animate-pulse rounded-full bg-primary-soft motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
      </dt>
      <dd className="mt-1 flex flex-wrap items-baseline gap-x-1 text-white">
        <span className="tabular text-3xl font-bold tracking-tight">{value}</span>
        <span className="text-sm text-ink-inverse-muted">{unit}</span>
        {warn && warnText && (
          <span className="mt-1.5 flex w-fit basis-full items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
              <path d="M6 2v5M6 9.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {warnText}
          </span>
        )}
      </dd>
    </div>
  );
}
