"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import vi from "../../../../messages/vi.json";
import type { ExamRegionId } from "@/components/avatar/AnatomyColliders";
import AvatarCanvas from "@/components/avatar/AvatarCanvas";
import ExamFindingPanel, { type ExamActionResponse } from "@/components/avatar/ExamFindingPanel";
import type { components } from "@/lib/api-client/schema";
import { patientLipSync } from "@/components/avatar/LipSyncController";
import { useVoiceSession, type VoiceTranscript } from "@/hooks/useVoiceSession";
import ChatInput from "@/components/workspace/ChatInput";
import PushToTalk from "@/components/workspace/PushToTalk";
import TranscriptBox, { type Turn } from "@/components/workspace/TranscriptBox";
import VitalsMonitor from "@/components/workspace/VitalsMonitor";
import { API_URL, authHeaders, whenAuthReady } from "@/lib/sessionAuth";

type ExamActionRequest = components["schemas"]["ExamActionRequest"];

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [mode, setMode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examOpen, setExamOpen] = useState(false);
  const [examResult, setExamResult] = useState<ExamActionResponse | null>(null);
  const [examLoading, setExamLoading] = useState(false);
  const [examError, setExamError] = useState<string | null>(null);

  // Voice turns land in the same transcript list as typed turns.
  const onVoiceTranscript = useCallback((t: VoiceTranscript) => {
    setTurns((cur) => [
      ...cur,
      { turn_idx: t.turn_idx ?? cur.length, speaker: t.speaker, text: t.text },
    ]);
  }, []);
  const voice = useVoiceSession({ sessionId: id, onTranscript: onVoiceTranscript });

  // Lip-sync follows the patient's voice playback once audio output exists.
  useEffect(() => {
    if (!voice.analyser) return;
    patientLipSync.attachAnalyser(voice.analyser);
    return () => patientLipSync.detach();
  }, [voice.analyser]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await whenAuthReady(); // the first request must carry the restored bearer token
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
  }, [id]);

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

  // End the interview: the backend completes the session and queues the
  // evaluation (idempotent), then the debrief page polls for the result.
  async function handleFinish() {
    setFinishing(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${id}/finish`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      voice.stop();
      router.push(`/debrief/${id}`);
    } catch {
      setError(vi.session.finishError);
      setFinishing(false);
    }
  }

  async function handleExam(body: ExamActionRequest) {
    setExamOpen(true);
    setExamLoading(true);
    setExamError(null);
    setExamResult(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setExamResult((await res.json()) as ExamActionResponse);
      // The exam was recorded as transcript turns: reload the canonical transcript.
      const tRes = await fetch(`${API_URL}/api/v1/sessions/${id}/turns`, {
        headers: authHeaders(),
      });
      if (tRes.ok) setTurns(await tRes.json());
    } catch {
      setExamError(vi.exam.error);
    } finally {
      setExamLoading(false);
    }
  }

  const examineRegion = (region: ExamRegionId) =>
    handleExam({ action: "examine_region", region });
  const observeChild = () => handleExam({ action: "observe_child" });

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
          onClick={handleFinish}
          disabled={finishing}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {finishing ? vi.session.finishing : vi.session.finish}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Patient visual area (avatar 3D arrives in a later slice) */}
        <aside className="hidden w-1/3 flex-col gap-4 overflow-y-auto border-r border-gray-200 p-4 md:flex">
          <AvatarCanvas
            onExamineRegion={examineRegion}
            onObserve={observeChild}
            busy={examLoading}
          />
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
          <PushToTalk
            status={voice.status}
            error={voice.error}
            notice={voice.notice}
            disabled={sending}
            onStart={() => void voice.start()}
            onStop={voice.stop}
          />
          <ChatInput
            onSend={handleSend}
            loading={sending || voice.status === "processing" || voice.status === "recording"}
          />
        </section>
      </div>

      <ExamFindingPanel
        open={examOpen}
        result={examResult}
        loading={examLoading}
        error={examError}
        onClose={() => setExamOpen(false)}
      />
    </main>
  );
}
