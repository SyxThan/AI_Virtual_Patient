"use client";

import { useState } from "react";
import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";
import { API_URL, authHeaders, whenAuthReady } from "@/lib/sessionAuth";

/**
 * Downloads the practice-report PDF. A plain <a href> would not send the
 * Bearer / X-Guest-Token header, so we fetch with auth, turn the body into a Blob and
 * trigger the download from an object URL.
 */
export default function ExportPdfButton({ sessionId, disabled }: { sessionId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportPdf() {
    setBusy(true);
    setError(null);
    try {
      await whenAuthReady();
      const res = await fetch(`${API_URL}/api/v1/sessions/${sessionId}/debrief/pdf`, {
        headers: authHeaders(),
      });
      if (res.status === 202) {
        setError(vi.debrief.pdf.notReady);
        return;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.includes("application/pdf")) {
        setError(vi.debrief.pdf.error);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `avp-practice-report-${sessionId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(vi.debrief.pdf.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={exportPdf}
        disabled={disabled || busy}
        className={`inline-flex items-center gap-2 rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
      >
        {busy && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
        )}
        {busy ? vi.debrief.pdf.exporting : vi.debrief.pdf.export}
      </button>
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
