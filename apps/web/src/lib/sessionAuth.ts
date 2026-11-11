// Browser-side API base + per-request auth headers (ADR-0008).
// Signed in: `Authorization: Bearer <Supabase access token>`; the token is cached
// here by AuthProvider (supabase-js keeps the real session). Guest sessions carry
// the X-Guest-Token saved by /setup in sessionStorage (never in URLs or QR codes).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const GUEST_TOKEN_KEY = "avp_guest_token";
export const GUEST_SESSION_KEY = "avp_guest_session_id";
/** Fired on window after every auth change, including the first restore on load. */
export const AUTH_CHANGED_EVENT = "avp-auth-changed";

let accessToken: string | null = null;
let markReady: () => void = () => {};
const ready = new Promise<void>((resolve) => {
  markReady = resolve;
});
const READY_FALLBACK_MS = 4000; // never block a page forever if the provider is missing

/** Called by AuthProvider only. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Called by AuthProvider once the stored session has been restored (or found absent). */
export function markAuthReady(): void {
  markReady();
}

/** Resolves once the initial session restore is done, so the first request carries the token. */
export function whenAuthReady(): Promise<void> {
  return Promise.race([
    ready,
    new Promise<void>((resolve) => setTimeout(resolve, READY_FALLBACK_MS)),
  ]);
}

export function isSignedIn(): boolean {
  return accessToken !== null;
}

export function guestToken(): string | null {
  try {
    return sessionStorage.getItem(GUEST_TOKEN_KEY);
  } catch {
    return null; // sessionStorage may be unavailable (private mode, SSR)
  }
}

export function rememberGuestSession(sessionId: string, token: string): void {
  try {
    sessionStorage.setItem(GUEST_TOKEN_KEY, token);
    sessionStorage.setItem(GUEST_SESSION_KEY, sessionId);
  } catch {
    /* ignore */
  }
}

export function forgetGuestSession(): void {
  try {
    sessionStorage.removeItem(GUEST_TOKEN_KEY);
    sessionStorage.removeItem(GUEST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  // The guest header is kept while signed in so an unclaimed guest session stays
  // reachable; the API ignores it for sessions that belong to a user.
  const t = guestToken();
  if (t) h["X-Guest-Token"] = t;
  if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
  return h;
}

/** First WebSocket message (the token is never put in the URL). */
export function wsAuthMessage(): { type: "auth"; access_token?: string; token?: string } {
  const t = guestToken() ?? undefined;
  if (accessToken) return { type: "auth", access_token: accessToken, token: t };
  return { type: "auth", token: t ?? "" };
}

/** Fill "{name}" placeholders in a vi.json string. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}
