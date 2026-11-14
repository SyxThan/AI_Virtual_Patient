"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import vi from "../../../messages/vi.json";
import { useAuth } from "@/components/auth/AuthProvider";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import PageShell from "@/components/ui/PageShell";
import Tile from "@/components/ui/Tile";
import { FOCUS_RING } from "@/components/ui/focus";
import { API_URL, authHeaders, rememberGuestSession, whenAuthReady } from "@/lib/sessionAuth";

const CASE_ID = "case-01-hfmd";

type Role = "student" | "resident" | "practitioner";
type Mode = "guided" | "exam";

const ROLES: Role[] = ["student", "resident", "practitioner"];
const MODES: Mode[] = ["guided", "exam"];

/** Selected / unselected mark for an option tile (the state is not shown by color alone). */
function SelectMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
        selected ? "border-primary bg-primary text-white" : "border-line-strong bg-surface"
      }`}
    >
      {selected && (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

function optionClass(selected: boolean, layout: string): string {
  return `flex w-full min-h-11 gap-3 rounded-card border-2 text-left ${layout} transition-colors ${FOCUS_RING} ${
    selected
      ? "border-primary bg-primary-soft text-ink"
      : "border-line bg-surface text-ink hover:border-line-strong"
  }`;
}

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
      if (!res.ok) {
        // 503 = the API could not reach Supabase to check the sign-in; 401 = token rejected.
        setError(
          res.status === 503
            ? vi.setup.error.authUnavailable
            : res.status === 401
              ? vi.setup.error.authExpired
              : vi.setup.error.generic,
        );
        setLoading(false);
        return;
      }
      const data: { id: string; guest_token?: string | null } = await res.json();
      if (data.guest_token) rememberGuestSession(data.id, data.guest_token);
      router.push(`/session/${data.id}`);
    } catch {
      setError(vi.setup.error.generic);
      setLoading(false);
    }
  }

  return (
    <PageShell title={vi.setup.title} description={vi.setupUx.intro} width="default">
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-4 rounded-card border border-warning/30 bg-warning-soft p-4 text-ink"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className={`-my-2 min-h-11 shrink-0 rounded-control px-2 text-sm font-semibold text-warning underline ${FOCUS_RING}`}
          >
            {vi.setup.error.dismiss}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
        {/* Case: the one fixed MVP case, in the warm pediatric tone */}
        <Tile tone="sand" as="section" aria-labelledby="case-title" className="lg:col-span-4">
          <p className="text-sm font-semibold">{vi.setup.case.label}</p>
          <h2 id="case-title" className="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">
            {vi.setup.case.title}
          </h2>
          <p className="mt-3 max-w-prose leading-relaxed text-ink">{vi.setup.case.summary}</p>
          <p className="mt-4 flex items-start gap-2 text-sm">
            <WarnIcon />
            {vi.setup.case.draftNotice}
          </p>
        </Tile>

        {/* Account status */}
        <Tile as="section" aria-labelledby="account-title" className="flex flex-col gap-3 lg:col-span-2">
          <h2 id="account-title" className="text-base font-bold">
            {vi.setupUx.accountTitle}
          </h2>
          {status === "loading" ? (
            <div className="h-5 w-3/4 animate-pulse rounded-full bg-canvas motion-reduce:animate-none" />
          ) : status === "signedIn" ? (
            <p className="text-sm text-ink-muted">{vi.auth.setupSignedIn}</p>
          ) : (
            <>
              <p className="text-sm text-ink-muted">{vi.auth.setupGuest}</p>
              {status === "signedOut" && (
                <Link
                  href="/login?next=/setup"
                  className={`inline-flex min-h-11 w-fit items-center rounded-control text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-strong ${FOCUS_RING}`}
                >
                  {vi.auth.setupSignIn}
                </Link>
              )}
            </>
          )}
        </Tile>

        {/* Role */}
        <Tile as="fieldset" className="min-w-0 lg:col-span-2">
          <legend className="float-left mb-4 w-full text-base font-bold">{vi.setup.role.label}</legend>
          <div className="clear-both flex flex-col gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
                className={optionClass(role === r, "items-center px-4 py-3")}
              >
                <SelectMark selected={role === r} />
                <span className="font-semibold">{vi.setup.role[r]}</span>
              </button>
            ))}
          </div>
        </Tile>

        {/* Mode */}
        <Tile as="fieldset" className="min-w-0 lg:col-span-4">
          <legend className="float-left mb-4 w-full text-base font-bold">{vi.setup.mode.label}</legend>
          <div className="clear-both grid gap-3 sm:grid-cols-2">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={optionClass(mode === m, "h-full items-start p-4")}
              >
                <SelectMark selected={mode === m} />
                <span className="min-w-0">
                  <span className="block text-lg font-bold">{vi.setup.mode[m]}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-muted">
                    {m === "guided" ? vi.setupUx.guidedDesc : vi.setupUx.examDesc}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Tile>

        {/* Consent, in its own card */}
        <Tile as="section" aria-labelledby="consent-title" className="lg:col-span-4">
          <h2 id="consent-title" className="text-base font-bold">
            {vi.setupUx.consentTitle}
          </h2>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-card border border-line bg-canvas p-4 text-sm leading-relaxed text-ink">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className={`mt-0.5 h-5 w-5 shrink-0 accent-primary ${FOCUS_RING}`}
            />
            <span>{vi.setup.consent.label}</span>
          </label>
          <Link
            href="/privacy"
            className={`mt-2 inline-flex min-h-11 w-fit items-center rounded-control text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-strong ${FOCUS_RING}`}
          >
            {vi.setupUx.privacyLink}
          </Link>
        </Tile>

        {/* Start: the page's single primary action */}
        <Tile
          as="section"
          aria-label={vi.setup.start}
          className="flex flex-col justify-between gap-4 lg:col-span-2"
        >
          <div className="flex flex-wrap gap-2">
            <Badge tone="primary">{vi.setup.role[role]}</Badge>
            <Badge tone="info">{vi.setup.mode[mode]}</Badge>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size="lg"
              disabled={!consent || loading}
              aria-describedby={!consent ? "consent-hint" : undefined}
              onClick={handleStart}
              className="w-full"
            >
              {loading ? vi.setup.starting : vi.setup.start}
            </Button>
            {!consent && (
              <p id="consent-hint" className="text-sm text-ink-muted">
                {vi.setupUx.consentHint}
              </p>
            )}
          </div>
        </Tile>
      </div>
    </PageShell>
  );
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M10 3l7.5 13h-15L10 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 8.5v3.5M10 14.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
