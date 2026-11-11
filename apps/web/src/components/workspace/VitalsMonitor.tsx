"use client";

import { useCallback, useEffect, useState } from "react";
import vi from "../../../messages/vi.json";
import { API_URL, authHeaders, whenAuthReady } from "@/lib/sessionAuth";

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

export default function VitalsMonitor({ sessionId }: { sessionId: string }) {
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

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4 text-gray-100">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-gray-300">{vi.monitor.title}</h3>
        {v && (
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-amber-300">
            {v.clinical_label}
          </span>
        )}
      </div>

      {error && <p className="mb-2 text-sm text-red-400">{vi.monitor.error}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric
          label={`❤ ${vi.monitor.hr}`}
          value={v ? `${v.heart_rate_bpm}` : "—"}
          unit={vi.monitor.unitBpm}
          className={`animate-pulse ${hrHigh ? "text-amber-400" : "text-emerald-400"}`}
        />
        <Metric
          label={`🌡 ${vi.monitor.temp}`}
          value={v ? v.temperature_c.toFixed(1) : "—"}
          unit="°C"
          className="text-red-400"
          warn={feverHigh}
          warnText={vi.monitor.feverWarning}
        />
        <Metric
          label={vi.monitor.rr}
          value={v ? `${v.respiratory_rate_bpm}` : "—"}
          unit={vi.monitor.unitBpm}
          className="text-blue-400"
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
          className={spo2Low ? "text-red-400" : "text-cyan-400"}
        />
      </div>

      {v && v.active_symptoms.length > 0 && (
        <div className="mt-3 text-xs text-gray-400">
          <span className="font-medium text-gray-300">{vi.monitor.symptoms}: </span>
          {v.active_symptoms.join(" · ")}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={measure}
          disabled={busy}
          className="rounded-md border border-gray-600 px-3 py-1.5 text-xs text-gray-100 disabled:opacity-50"
        >
          {busy ? vi.monitor.loading : vi.monitor.measure}
        </button>
        <button
          type="button"
          onClick={() => sendEvent("ORDER_ANTIPYRETIC")}
          disabled={busy}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {vi.monitor.antipyretic}
        </button>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  unit,
  className,
  warn,
  warnText,
}: {
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
        warn ? "animate-pulse border-red-500 bg-red-950" : "border-gray-700 bg-gray-800"
      }`}
    >
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${className ?? ""}`}>
        {value}
        <span className="ml-1 text-xs font-normal text-gray-400">{unit}</span>
      </div>
      {warn && warnText && <div className="text-[10px] text-red-400">{warnText}</div>}
    </div>
  );
}
