// Browser-side API base + per-session auth headers. Guest sessions carry the
// X-Guest-Token saved by /setup in sessionStorage (never put in URLs or QR codes).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  try {
    const t = sessionStorage.getItem("avp_guest_token");
    if (t) h["X-Guest-Token"] = t;
  } catch {
    /* sessionStorage may be unavailable (private mode, SSR) */
  }
  return h;
}

/** Fill "{name}" placeholders in a vi.json string. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}
