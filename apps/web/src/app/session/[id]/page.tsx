"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import vi from "../../../../messages/vi.json";
import ChatInput from "@/components/workspace/ChatInput";
import TranscriptBox, { type Turn } from "@/components/workspace/TranscriptBox";
import VitalsMonitor from "@/components/workspace/VitalsMonitor";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [mode, setMode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    try {
      const t = sessionStorage.getItem("avp_guest_token");
      if (t) h["X-Guest-Token"] = t;
    } catch {
      /* sessionStorage may be unavailable */
    }
    return h;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sRes, tRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/sessions/${id}`, { headers: authHeaders() }),
          fetch(`${API_URL}/api/v1/sessions/${id}/turns`, { headers: authHeaders() }),
        ]);
        if (sRes.ok && !cancelled) setMode((await sRes.json()).mode);
        if (tRes.ok && !cancelled) setTurns(await tRes.json());
        else if (!tRes.ok && !cancelled) setError(vi.session.loadError);
      } catch {
        if (!cancelled) setError(vi.session.loadError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, authHeaders]);

  async function handleSend(text: string) {
    setSending(true);
    setError(null);
    setTurns((cur) => [...cur, { turn_idx: cur.length, speaker: "student", text }]);
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${id}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      const patient: Turn = await res.json();
      setTurns((cur) => [...cur, patient]);
    } catch {
      setError(vi.session.sendError);
    } finally {
      setSending(false);
    }
  }

  const modeLabel = mode === "exam" ? vi.session.mode.exam : vi.session.mode.guided;

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <div>
          <h1 className="font-semibold">{vi.session.patientName}</h1>
          <p className="text-xs text-gray-500">
            {vi.session.modeLabel}: {modeLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/debrief/${id}`)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          {vi.session.finish}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Patient visual area (avatar 3D arrives in a later slice) */}
        <aside className="hidden w-1/3 flex-col gap-4 overflow-y-auto border-r border-gray-200 p-4 md:flex">
          <div className="flex flex-col items-center rounded-lg bg-gray-50 p-5 text-center">
            <div className="mb-2 text-5xl">👩‍🍼</div>
            <h2 className="font-medium">{vi.session.patientCard.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{vi.session.patientCard.desc}</p>
          </div>
          <VitalsMonitor sessionId={id} />
        </aside>

        {/* Chat & transcript */}
        <section className="flex flex-1 flex-col">
          <TranscriptBox turns={turns} />
          {error && (
            <div role="alert" className="mx-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
          <ChatInput onSend={handleSend} loading={sending} />
        </section>
      </div>
    </main>
  );
}
