"use client";

import { useState } from "react";
import vi from "../../../messages/vi.json";
import ConfirmDialog from "@/components/privacy/ConfirmDialog";
import { API_URL, GUEST_SESSION_KEY, authHeaders, forgetGuestSession } from "@/lib/sessionAuth";

type Props = { sessionId: string; onDeleted: () => void; className?: string };

type Phase = "idle" | "working" | "notFound" | "error";

/** If this tab's guest session is the one deleted, drop its now-useless token. */
export function forgetIfCurrentGuest(sessionId: string): void {
  try {
    if (sessionStorage.getItem(GUEST_SESSION_KEY) === sessionId) forgetGuestSession();
  } catch {
    /* sessionStorage unavailable: nothing stored */
  }
}

/**
 * "Xoá phiên" with a confirm dialog (Slice 13, T-PRIV-01). Calls
 * DELETE /api/v1/sessions/{id} with the caller's auth headers (Bearer and/or guest
 * token). 204 -> onDeleted(); 404 means it is gone or not ours (never revealed).
 */
export default function DeleteSessionButton({ sessionId, onDeleted, className }: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const busy = phase === "working";

  function close() {
    setOpen(false);
    setPhase("idle");
  }

  async function confirm() {
    setPhase("working");
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.status === 204) {
        forgetIfCurrentGuest(sessionId);
        setOpen(false);
        setPhase("idle");
        onDeleted();
        return;
      }
      if (res.status === 404) {
        forgetIfCurrentGuest(sessionId); // the token no longer opens it: drop it too
        setPhase("notFound");
        return;
      }
      setPhase("error");
    } catch {
      setPhase("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        }
      >
        {vi.privacy.delete.button}
      </button>
      <ConfirmDialog
        open={open}
        title={vi.privacy.delete.dialogTitle}
        onCancel={close}
        busy={busy}
        actions={
          <>
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {vi.privacy.delete.cancel}
            </button>
            {phase !== "notFound" && (
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {busy ? vi.privacy.delete.working : vi.privacy.delete.confirm}
              </button>
            )}
          </>
        }
      >
        <p>{vi.privacy.delete.dialogBody}</p>
        {(phase === "notFound" || phase === "error") && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">
            {phase === "notFound" ? vi.privacy.delete.notFound : vi.privacy.delete.error}
          </p>
        )}
        {busy && (
          <p role="status" className="sr-only">
            {vi.privacy.delete.working}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
