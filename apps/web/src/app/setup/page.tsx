"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import vi from "../../../messages/vi.json";
import { useAuth } from "@/components/auth/AuthProvider";
import { FOCUS_RING } from "@/components/ui/focus";
import { API_URL, authHeaders, rememberGuestSession, whenAuthReady } from "@/lib/sessionAuth";

const CASE_ID = "case-01-hfmd";

type Role = "student" | "resident" | "practitioner";
type Mode = "guided" | "exam";

const ROLES: Role[] = ["student", "resident", "practitioner"];
const MODES: Mode[] = ["guided", "exam"];

export default function SetupPage() {
  const router = useRouter();
  const { status } = useAuth();
  const [role, setRole] = useState<Role>("student");
  const [mode, setMode] = useState<Mode>("guided");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      await whenAuthReady(); // a signed-in user's session is created under their account
      const res = await fetch(`${API_URL}/api/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ case_id: CASE_ID, mode, role, consent: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { id: string; guest_token?: string | null } = await res.json();
      if (data.guest_token) rememberGuestSession(data.id, data.guest_token);
      router.push(`/session/${data.id}`);
    } catch {
      setError(vi.setup.error.generic);
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-gray-900">{vi.setup.title}</h1>

      {status === "signedIn" ? (
        <p className="text-sm text-gray-700">{vi.auth.setupSignedIn}</p>
      ) : status !== "loading" ? (
        <p className="text-sm text-gray-700">
          {vi.auth.setupGuest}{" "}
          {status === "signedOut" && (
            <Link href="/login?next=/setup" className={`rounded underline ${FOCUS_RING}`}>
              {vi.auth.setupSignIn}
            </Link>
          )}
        </p>
      ) : null}

      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 rounded-md border border-red-300 bg-red-50 p-3 text-red-800"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className={`shrink-0 rounded text-sm underline ${FOCUS_RING}`}
          >
            {vi.setup.error.dismiss}
          </button>
        </div>
      )}

      {/* Case card */}
      <section className="rounded-lg border border-gray-200 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
          {vi.setup.case.label}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-gray-900">{vi.setup.case.title}</h2>
        <p className="mt-2 text-gray-700">{vi.setup.case.summary}</p>
        <p className="mt-3 text-xs text-amber-800">
          <span aria-hidden="true">⚠ </span>
          {vi.setup.case.draftNotice}
        </p>
      </section>

      {/* Role */}
      <fieldset>
        <legend className="mb-2 font-medium">{vi.setup.role.label}</legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              className={`rounded-md border px-4 py-2 text-sm ${FOCUS_RING} ${
                role === r
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-400 text-gray-900 hover:bg-gray-50"
              }`}
            >
              {vi.setup.role[r]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Mode */}
      <fieldset>
        <legend className="mb-2 font-medium">{vi.setup.mode.label}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md border p-4 text-left ${FOCUS_RING} ${
                mode === m
                  ? "border-gray-900 ring-1 ring-gray-900"
                  : "border-gray-400 hover:bg-gray-50"
              }`}
            >
              <span className="font-medium text-gray-900">{vi.setup.mode[m]}</span>
              <span className="mt-1 block text-sm text-gray-700">
                {m === "guided" ? vi.setupUx.guidedDesc : vi.setupUx.examDesc}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* Consent */}
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-3 text-sm text-gray-900">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className={`mt-1 h-4 w-4 shrink-0 accent-gray-900 ${FOCUS_RING}`}
          />
          <span>{vi.setup.consent.label}</span>
        </label>
        <Link
          href="/privacy"
          className={`ml-7 w-fit rounded text-sm text-blue-800 underline ${FOCUS_RING}`}
        >
          {vi.setupUx.privacyLink}
        </Link>
      </div>

      {/* Start */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={!consent || loading}
          aria-describedby={!consent ? "consent-hint" : undefined}
          onClick={handleStart}
          className={`w-fit rounded-md bg-gray-900 px-5 py-2.5 text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
        >
          {loading ? vi.setup.starting : vi.setup.start}
        </button>
        {!consent && (
          <p id="consent-hint" className="text-xs text-gray-700">
            {vi.setupUx.consentHint}
          </p>
        )}
      </div>
    </main>
  );
}
