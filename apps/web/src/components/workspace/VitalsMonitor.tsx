"use client";

import { useCallback, useEffect, useState } from "react";
import vi from "../../../messages/vi.json";
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
    <section
      aria-labelledby="vitals-title"
      className="rounded-lg border border-gray-800 bg-gray-900 p-4 text-gray-100"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="vitals-title" className="text-sm font-semibold tracking-wide text-gray-200">
          {vi.monitor.title}
        </h2>
        {v && (
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-amber-300">
            {v.clinical_label}
          </span>
        )}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {alerts.length > 0 ? fmt(vi.a11y.vitalsAlert, { alerts: alerts.join(", ") }) : ""}
      </p>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-300">
          {vi.monitor.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric
          icon="❤"
          label={vi.monitor.hr}
          value={v ? `${v.heart_rate_bpm}` : "—"}
          unit={vi.monitor.unitBpm}
          className={hrHigh ? "text-amber-300" : "text-emerald-300"}
          pulse
        />
        <Metric
          icon="🌡"
          label={vi.monitor.temp}
          value={v ? v.temperature_c.toFixed(1) : "—"}
          unit="°C"
          className="text-red-300"
          warn={feverHigh}
          warnText={vi.monitor.feverWarning}
        />
        <Metric
          label={vi.monitor.rr}
          value={v ? `${v.respiratory_rate_bpm}` : "—"}
          unit={vi.monitor.unitBpm}
          className="text-sky-300"
        />
        <Metric
          label={vi.monitor.bp}
          value={v ? `${v.blood_pressure_sys}/${v.blood_pressure_dia}` : "—"}
          unit="mmHg"
          className="text-gray-100"
        />
        <Metric
          label={vi.monitor.spo2}
          value={v ? `${v.spo2_percent}` : "—"}
          unit="%"
          className={spo2Low ? "text-red-300" : "text-cyan-300"}
        />
      </div>

      {v && v.active_symptoms.length > 0 && (
        <div className="mt-3 text-xs text-gray-300">
          <span className="font-medium text-gray-200">{vi.monitor.symptoms}: </span>
          {v.active_symptoms.join(" · ")}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={measure}
          disabled={busy || disabled}
          className={`rounded-md border border-gray-500 px-3 py-1.5 text-xs text-gray-100 hover:bg-gray-800 disabled:opacity-50 ${FOCUS_RING_DARK}`}
        >
          {busy ? vi.monitor.loading : vi.monitor.measure}
        </button>
        <button
          type="button"
          onClick={() => sendEvent("ORDER_ANTIPYRETIC")}
          disabled={busy || disabled}
          className={`rounded-md bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-800 disabled:opacity-50 ${FOCUS_RING_DARK}`}
        >
          {vi.monitor.antipyretic}
        </button>
      </div>
    </section>
  );
}

function Metric({
  pulse,
  icon,
  label,
  value,
  unit,
  className,
  warn,
  warnText,
}: {
  pulse?: boolean;
  icon?: string;
  label: string;
  value: string;
  unit: string;
  className?: string;
  warn?: boolean;
  warnText?: string;
}) {
  return (
    <div
      className={`rounded-md border p-2 ${
        warn ? "border-red-500 bg-red-950 ring-1 ring-red-500" : "border-gray-700 bg-gray-800"
      }`}
    >
      <div className="flex items-center gap-1 text-xs text-gray-300">
        {icon && <span aria-hidden="true">{icon}</span>}
        {label}
        {pulse && (
          <span
            className="ml-auto h-2 w-2 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${className ?? ""}`}>
        {value}
        <span className="ml-1 text-xs font-normal text-gray-300">{unit}</span>
      </div>
      {warn && warnText && <div className="text-xs text-red-300">{warnText}</div>}
    </div>
  );
}
