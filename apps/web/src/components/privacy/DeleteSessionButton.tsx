"use client";

import { useState } from "react";
import vi from "../../../messages/vi.json";
import ConfirmDialog from "@/components/privacy/ConfirmDialog";
import { buttonClass } from "@/components/ui/Button";
import { FOCUS_RING } from "@/components/ui/focus";
import { API_URL, GUEST_SESSION_KEY, authHeaders, forgetGuestSession } from "@/lib/sessionAuth";

/** `className` is appended to the trigger's own classes (layout such as `ml-auto`). */
type Props = { sessionId: string; onDeleted: () => void; className?: string };

type Phase = "idle" | "working" | "notFound" | "error";

// Quiet trigger (it repeats on every history card); the solid danger button is the confirm.
const TRIGGER = `inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft ${FOCUS_RING}`;

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <path
        d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
        className={className ? `${TRIGGER} ${className}` : TRIGGER}
      >
        <TrashIcon />
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
              className={buttonClass({ variant: "secondary" })}
            >
              {vi.privacy.delete.cancel}
            </button>
            {phase !== "notFound" && (
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy}
                className={buttonClass({ variant: "danger" })}
              >
                {busy ? vi.privacy.delete.working : vi.privacy.delete.confirm}
              </button>
            )}
          </>
        }
      >
        <p>{vi.privacy.delete.dialogBody}</p>
        {(phase === "notFound" || phase === "error") && (
          <p role="alert" className="rounded-control border border-warning/30 bg-warning-soft px-4 py-3 text-warning">
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
