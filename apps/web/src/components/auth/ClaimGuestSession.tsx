"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import vi from "../../../messages/vi.json";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  API_URL,
  AUTH_CHANGED_EVENT,
  GUEST_SESSION_KEY,
  authHeaders,
  forgetGuestSession,
  guestToken,
} from "@/lib/sessionAuth";

const DISMISSED_KEY = "avp_claim_dismissed";

type Phase = "hidden" | "offer" | "working" | "done" | "failed";

function pendingGuestSession(): string | null {
  try {
    const sid = sessionStorage.getItem(GUEST_SESSION_KEY);
    if (!sid || !guestToken()) return null;
    if (sessionStorage.getItem(DISMISSED_KEY) === sid) return null;
    return sid;
  } catch {
    return null;
  }
}

/**
 * After sign-in, offers to move the guest session of this tab into the account
 * (POST /sessions/{id}/claim with the guest token; AVP-108). Declining keeps the
 * guest session reachable in this tab, it just will not appear in the history.
 */
export default function ClaimGuestSession() {
  const { status } = useAuth();
  const [phase, setPhase] = useState<Phase>("hidden");
  const [sessionId, setSessionId] = useState<string | null>(null);

  const check = useCallback(() => {
    const sid = status === "signedIn" ? pendingGuestSession() : null;
    setSessionId(sid);
    setPhase((p) => (sid ? (p === "working" ? p : "offer") : p === "offer" ? "hidden" : p));
  }, [status]);

  useEffect(() => {
    const id = setTimeout(check, 0); // after the auth state settles
    window.addEventListener(AUTH_CHANGED_EVENT, check);
    return () => {
      clearTimeout(id);
      window.removeEventListener(AUTH_CHANGED_EVENT, check);
    };
  }, [check]);

  async function claim() {
    if (!sessionId) return;
    setPhase("working");
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${sessionId}/claim`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        forgetGuestSession();
        setPhase("done");
      } else if (res.status === 404) {
        forgetGuestSession(); // the guest token no longer opens this session
        setPhase("failed");
      } else {
        setPhase("failed");
      }
    } catch {
      setPhase("failed");
    }
  }

  function dismiss() {
    try {
      if (sessionId) sessionStorage.setItem(DISMISSED_KEY, sessionId);
    } catch {
      /* ignore */
    }
    setPhase("hidden");
  }

  if (phase === "hidden") return null;
  const tone =
    phase === "failed"
      ? "border-warning-soft bg-warning-soft text-warning"
      : phase === "done"
        ? "border-success-soft bg-success-soft text-success"
        : "border-info-soft bg-info-soft text-ink";
  return (
    <div role="status" className={`mx-3 mt-3 rounded-card border px-4 py-2 text-sm sm:mx-6 ${tone}`}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <span>
          {phase === "done"
            ? vi.auth.claim.done
            : phase === "failed"
              ? vi.auth.claim.failed
              : vi.auth.claim.prompt}
        </span>
        <div className="flex gap-2">
          {phase === "offer" || phase === "working" ? (
            <>
              <button
                type="button"
                onClick={claim}
                disabled={phase === "working"}
                className={buttonClass({ variant: "primary", size: "sm" })}
              >
                {phase === "working" ? vi.auth.claim.working : vi.auth.claim.accept}
              </button>
              <button type="button" onClick={dismiss} className={buttonClass({ variant: "ghost", size: "sm" })}>
                {vi.auth.claim.dismiss}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setPhase("hidden")}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              {vi.setup.error.dismiss}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
