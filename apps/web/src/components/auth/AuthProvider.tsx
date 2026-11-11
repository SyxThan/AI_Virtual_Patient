"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authConfigured, getSupabase } from "@/lib/supabaseClient";
import { AUTH_CHANGED_EVENT, markAuthReady, setAccessToken } from "@/lib/sessionAuth";

/**
 * Holds the Supabase session for the UI (ADR-0008). supabase-js stores and
 * refreshes the session; we only mirror the access token into sessionAuth so the
 * synchronous authHeaders() can send `Authorization: Bearer`, and fire
 * "avp-auth-changed" after every change (including the first restore).
 */

export type AuthStatus = "loading" | "signedIn" | "signedOut" | "unavailable";

type AuthContextValue = {
  status: AuthStatus;
  email: string | null;
  configured: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  status: "loading",
  email: null,
  configured: authConfigured,
  signOut: async () => {},
});

function announce(): void {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(authConfigured ? "loading" : "unavailable");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setAccessToken(null);
      markAuthReady();
      announce();
      return;
    }
    let active = true;

    const apply = (session: Session | null) => {
      setAccessToken(session?.access_token ?? null);
      setEmail(session?.user.email ?? null);
      setStatus(session ? "signedIn" : "signedOut");
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        apply(data.session);
      })
      .catch(() => {
        if (active) apply(null);
      })
      .finally(() => {
        markAuthReady();
        announce();
      });

    // SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY...
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || event === "INITIAL_SESSION") return; // covered by getSession above
      apply(session);
      announce();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } finally {
      // onAuthStateChange also fires; clear eagerly so the next request is a guest one.
      setAccessToken(null);
      setEmail(null);
      setStatus("signedOut");
      announce();
    }
  }, []);

  const value = useMemo(
    () => ({ status, email, configured: authConfigured, signOut }),
    [status, email, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
