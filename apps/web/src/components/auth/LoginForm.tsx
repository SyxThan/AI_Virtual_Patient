"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import vi from "../../../messages/vi.json";
import { useAuth } from "@/components/auth/AuthProvider";
import { buttonClass } from "@/components/ui/Button";
import { FOCUS_RING } from "@/components/ui/focus";
import { authErrorMessage, safeNext } from "@/components/auth/authErrors";
import { fmt } from "@/lib/sessionAuth";
import { getSupabase } from "@/lib/supabaseClient";

type Mode = "signIn" | "signUp" | "magic" | "forgot" | "reset";

const MIN_PASSWORD = 8;

const INPUT = `h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-muted ${FOCUS_RING}`;
const LINK = `rounded-control font-semibold text-primary underline-offset-4 hover:underline ${FOCUS_RING}`;
// Form errors are not red flags or destructive actions, so they use the warning tone.
const ALERT = "rounded-control border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning";
const NOTICE = "rounded-control border border-success/30 bg-success-soft px-4 py-3 text-sm text-success";

function callbackUrl(next: string): string {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

/**
 * Email + password sign-in / sign-up, magic link, forgot / reset password.
 * supabase-js is used for sign-in only (ADR-0008); the API never sees passwords.
 */
export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, email: signedInEmail, configured } = useAuth();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>(params.get("mode") === "reset" ? "reset" : "signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase) return;
    setError(null);
    setNotice(null);
    if (mode !== "reset" && !email.trim()) {
      setError(vi.auth.errors.missingEmail);
      return;
    }
    if ((mode === "signUp" || mode === "reset") && password.length < MIN_PASSWORD) {
      setError(vi.auth.errors.weakPassword);
      return;
    }
    setBusy(true);
    try {
      const addr = email.trim();
      if (mode === "signIn") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: addr, password });
        if (err) throw err;
        router.push(next);
        return;
      }
      if (mode === "signUp") {
        const { data, error: err } = await supabase.auth.signUp({
          email: addr,
          password,
          options: { emailRedirectTo: callbackUrl(next) },
        });
        if (err) throw err;
        if (data.session) {
          router.push(next);
          return;
        }
        setNotice(vi.auth.sent.signUp);
      } else if (mode === "magic") {
        const { error: err } = await supabase.auth.signInWithOtp({
          email: addr,
          options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: true },
        });
        if (err) throw err;
        setNotice(vi.auth.sent.magic);
      } else if (mode === "forgot") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(addr, {
          redirectTo: callbackUrl("/login?mode=reset"),
        });
        if (err) throw err;
        setNotice(vi.auth.sent.forgot); // same text whether or not the email exists
      } else {
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) throw err;
        setNotice(vi.auth.sent.reset);
        setPassword("");
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{vi.auth.title}</h1>
        <p role="status" className={ALERT}>
          {vi.auth.unavailable}
        </p>
        <Link href="/setup" className={buttonClass({ variant: "primary", className: "w-full sm:w-fit" })}>
          {vi.auth.guest}
        </Link>
      </div>
    );
  }

  const title = {
    signIn: vi.auth.title,
    signUp: vi.auth.signUpTitle,
    magic: vi.auth.magicTitle,
    forgot: vi.auth.forgotTitle,
    reset: vi.auth.resetTitle,
  }[mode];
  const submitLabel = {
    signIn: vi.auth.submitSignIn,
    signUp: vi.auth.submitSignUp,
    magic: vi.auth.submitMagic,
    forgot: vi.auth.submitForgot,
    reset: vi.auth.submitReset,
  }[mode];
  const tabs: Mode[] = ["signIn", "magic", "signUp"];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>

      {status === "signedIn" && signedInEmail && mode !== "reset" && (
        <p className="rounded-control bg-primary-soft px-4 py-3 text-sm text-primary-strong">
          {fmt(vi.auth.signedInAs, { email: signedInEmail })}
        </p>
      )}

      {(mode === "signIn" || mode === "signUp" || mode === "magic") && (
        <div role="tablist" className="grid grid-cols-3 gap-1 rounded-control bg-canvas p-1">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={mode === t}
              onClick={() => switchMode(t)}
              className={`min-h-11 rounded-[0.5rem] px-2 py-1.5 text-sm font-semibold leading-tight transition-colors ${FOCUS_RING} ${
                mode === t ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              {vi.auth.tabs[t as "signIn" | "magic" | "signUp"]}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className={ALERT}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={NOTICE}>
          {notice}
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {mode !== "reset" && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-ink">{vi.auth.email}</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT}
            />
          </label>
        )}
        {(mode === "signIn" || mode === "signUp" || mode === "reset") && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-ink">
              {mode === "reset" ? vi.auth.newPassword : vi.auth.password}
            </span>
            <input
              type="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              required
              minLength={mode === "signIn" ? undefined : MIN_PASSWORD}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
            />
            {mode !== "signIn" && <span className="text-sm text-ink-muted">{vi.auth.passwordHint}</span>}
          </label>
        )}
        <button
          type="submit"
          disabled={busy}
          className={buttonClass({ variant: "primary", size: "lg", className: "mt-1 w-full" })}
        >
          {busy ? vi.auth.working : submitLabel}
        </button>
      </form>

      {(mode === "signIn" || mode === "forgot" || mode === "reset") && (
        <div className="flex flex-wrap gap-4 text-sm">
          {mode === "signIn" && (
            <button type="button" onClick={() => switchMode("forgot")} className={`min-h-11 ${LINK}`}>
              {vi.auth.forgotLink}
            </button>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <button type="button" onClick={() => switchMode("signIn")} className={`min-h-11 ${LINK}`}>
              {vi.auth.backToSignIn}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-6">
        <Link href="/setup" className={buttonClass({ variant: "secondary", className: "w-full" })}>
          {vi.auth.guest}
        </Link>
        <p className="text-sm text-ink-muted">{vi.auth.guestHint}</p>
      </div>
    </div>
  );
}
