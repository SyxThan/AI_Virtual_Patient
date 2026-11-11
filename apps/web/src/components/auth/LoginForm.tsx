"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import vi from "../../../messages/vi.json";
import { useAuth } from "@/components/auth/AuthProvider";
import { authErrorMessage, safeNext } from "@/components/auth/authErrors";
import { fmt } from "@/lib/sessionAuth";
import { getSupabase } from "@/lib/supabaseClient";

type Mode = "signIn" | "signUp" | "magic" | "forgot" | "reset";

const MIN_PASSWORD = 8;

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
      <div className="flex flex-col gap-4">
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          {vi.auth.unavailable}
        </p>
        <Link href="/setup" className="w-fit rounded-md bg-black px-4 py-2 text-white">
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
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">{title}</h1>

      {status === "signedIn" && signedInEmail && mode !== "reset" && (
        <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
          {fmt(vi.auth.signedInAs, { email: signedInEmail })}
        </p>
      )}

      {(mode === "signIn" || mode === "signUp" || mode === "magic") && (
        <div role="tablist" className="flex gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={mode === t}
              onClick={() => switchMode(t)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                mode === t ? "border-black bg-black text-white" : "border-gray-300"
              }`}
            >
              {vi.auth.tabs[t as "signIn" | "magic" | "signUp"]}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {mode !== "reset" && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{vi.auth.email}</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
        )}
        {(mode === "signIn" || mode === "signUp" || mode === "reset") && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              {mode === "reset" ? vi.auth.newPassword : vi.auth.password}
            </span>
            <input
              type="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              required
              minLength={mode === "signIn" ? undefined : MIN_PASSWORD}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2"
            />
            {mode !== "signIn" && <span className="text-xs text-gray-500">{vi.auth.passwordHint}</span>}
          </label>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-fit rounded-md bg-black px-5 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? vi.auth.working : submitLabel}
        </button>
      </form>

      <div className="flex flex-wrap gap-4 text-sm">
        {mode === "signIn" && (
          <button type="button" onClick={() => switchMode("forgot")} className="underline">
            {vi.auth.forgotLink}
          </button>
        )}
        {(mode === "forgot" || mode === "reset") && (
          <button type="button" onClick={() => switchMode("signIn")} className="underline">
            {vi.auth.backToSignIn}
          </button>
        )}
      </div>

      <hr className="border-gray-200" />
      <div className="flex flex-col gap-2">
        <Link href="/setup" className="w-fit rounded-md border border-gray-300 px-4 py-2">
          {vi.auth.guest}
        </Link>
        <p className="text-xs text-gray-500">{vi.auth.guestHint}</p>
      </div>
    </div>
  );
}
