import vi from "../../../messages/vi.json";

/** Map a Supabase Auth error to a Vietnamese message (never show raw provider text). */
export function authErrorMessage(err: unknown): string {
  const e = (err ?? {}) as { code?: string; status?: number; message?: string };
  const code = e.code ?? "";
  const msg = (e.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials"))
    return vi.auth.errors.invalidCredentials;
  if (code === "email_not_confirmed" || msg.includes("email not confirmed"))
    return vi.auth.errors.emailNotConfirmed;
  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered"))
    return vi.auth.errors.userExists;
  if (code === "weak_password" || msg.includes("password should be"))
    return vi.auth.errors.weakPassword;
  if (e.status === 429 || code.startsWith("over_") || msg.includes("rate limit"))
    return vi.auth.errors.rateLimited;
  return vi.auth.errors.generic;
}

/** Only same-origin relative paths are allowed as a post-login destination. */
export function safeNext(next: string | null | undefined, fallback = "/setup"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
