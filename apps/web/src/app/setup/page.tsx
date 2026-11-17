"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import vi from "../../../messages/vi.json";
import CaseProfile from "@/components/setup/CaseProfile";
import DeviceCheck from "@/components/setup/DeviceCheck";
import { ChoiceRow, StepHeading } from "@/components/setup/SetupControls";
import SetupTopBar from "@/components/setup/SetupTopBar";
import {
  DEFAULT_PREFS,
  MODES,
  ROLES,
  enterStartsSession,
  getPrefsSnapshot,
  subscribePrefs,
  updatePrefs,
} from "@/components/setup/setupPrefs";
import { useClinicPreload, useMicCheck, useWebgl } from "@/components/setup/useDeviceCheck";
import { FOCUS_RING } from "@/components/ui/focus";
import { API_URL, authHeaders, rememberGuestSession, whenAuthReady } from "@/lib/sessionAuth";
import { navigateToStage } from "@/lib/stageTransition";

const CASE_ID = "case-01-hfmd";
const ux = vi.setupUx;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Setup screen: "HỒ SƠ CA" (left, 7/12) and "THIẾT LẬP" (right, 5/12) with the
 * four real steps in order (role, mode, device check, consent) and the start
 * area pinned to the panel's bottom (a fixed bar below 1024px). The start
 * button is always enabled: pressing it without consent points at step 4.
 * The API call is unchanged (`POST /api/v1/sessions`).
 */
export default function SetupPage() {
  const router = useRouter();
  // Last role/mode, remembered in localStorage (consent is never remembered).
  const { role, mode } = useSyncExternalStore(subscribePrefs, getPrefsSnapshot, () => DEFAULT_PREFS);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [deviceError, setDeviceError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consentBoxRef = useRef<HTMLInputElement>(null);
  const consentStepRef = useRef<HTMLDivElement>(null);
  const deviceStepRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);

  const webgl = useWebgl();
  const preload = useClinicPreload(webgl);
  const mic = useMicCheck(meterRef);
  const finishMic = mic.finish;

  const pointAt = useCallback((el: HTMLElement | null) => {
    el?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  const handleStart = useCallback(async () => {
    if (loading) return; // lock repeated presses while the session is created
    if (!consent) {
      setConsentError(true);
      const step = consentStepRef.current;
      if (step && !prefersReducedMotion()) {
        // Restart the one-shot shake without remounting (focus must stay on the checkbox).
        step.classList.remove("setup-shake");
        void step.offsetWidth;
        step.classList.add("setup-shake");
      }
      pointAt(step);
      consentBoxRef.current?.focus({ preventScroll: true });
      return;
    }
    if (webgl === "unsupported") {
      setDeviceError(true);
      pointAt(deviceStepRef.current);
      return;
    }
    setLoading(true);
    setError(null);
    finishMic(); // release the microphone before the workspace asks for it
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
      navigateToStage(router.push, `/session/${data.id}`);
    } catch {
      setError(vi.setup.error.generic);
      setLoading(false);
    }
  }, [loading, consent, webgl, mode, role, finishMic, pointAt, router.push]);

  // Enter starts the session unless focus is on something Enter already drives.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (!enterStartsSession(e.target as HTMLElement | null)) return;
      e.preventDefault();
      void handleStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleStart]);

  const deviceDone = webgl === "ok" && preload.phase === "ready" && (mic.state === "ok" || mic.state === "skipped");
  const summary = [vi.setup.role[role], vi.setup.mode[mode]].join(" · ");

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      <SetupTopBar />

      <main
        id="main"
        className="mx-auto grid w-full max-w-[1680px] flex-1 grid-cols-1 gap-6 px-4 pb-44 pt-2 lg:min-h-0 lg:grid-cols-12 lg:gap-8 lg:px-8 lg:pb-6 short:pb-4"
      >
        {/* ------------------------------------------------ HỒ SƠ CA (7/12) */}
        <div className="setup-enter-stage min-w-0 lg:col-span-7 lg:min-h-0 short:col-span-6 lg:overflow-y-auto lg:pr-2">
          <CaseProfile />
        </div>

        {/* ------------------------------------------------ THIẾT LẬP (5/12) */}
        <section
          aria-labelledby="setup-title"
          className="setup-enter-panel flex min-w-0 flex-col lg:col-span-5 lg:min-h-0 short:col-span-6 lg:rounded-tile lg:bg-surface lg:shadow-lift lg:ring-1 lg:ring-line/70"
        >
          <h2
            id="setup-title"
            className="text-xs font-bold uppercase tracking-[0.14em] text-ink-muted lg:px-6 lg:pt-4"
          >
            {ux.setupLabel}
          </h2>

          <div className="flex flex-col divide-y divide-line lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-6">
            {/* 1. Role */}
            <fieldset className="min-w-0 py-3 short:py-2">
              <legend className="float-left mb-2 w-full">
                <StepHeading n={1} done>
                  {vi.setup.role.label}
                </StepHeading>
              </legend>
              <div className="clear-both flex flex-col gap-1.5 short:grid short:grid-cols-3">
                {ROLES.map((r) => (
                  <ChoiceRow key={r} name="role" value={r} checked={role === r} onSelect={() => updatePrefs({ role: r })}>
                    {vi.setup.role[r]}
                  </ChoiceRow>
                ))}
              </div>
            </fieldset>

            {/* 2. Mode: segmented, the description of the chosen mode below */}
            <fieldset className="min-w-0 py-3 short:py-2" aria-describedby="mode-desc">
              <legend className="float-left mb-2 w-full">
                <StepHeading n={2} done>
                  {vi.setup.mode.label}
                </StepHeading>
              </legend>
              <div className="clear-both grid grid-cols-2 gap-2">
                {MODES.map((m) => (
                  <ChoiceRow key={m} name="mode" value={m} checked={mode === m} onSelect={() => updatePrefs({ mode: m })}>
                    {vi.setup.mode[m]}
                  </ChoiceRow>
                ))}
              </div>
              <p id="mode-desc" key={mode} className="setup-fade mt-1.5 text-sm leading-snug text-ink-muted">
                {mode === "guided" ? ux.guidedDesc : ux.examDesc}
              </p>
            </fieldset>

            {/* 3. Device check (does not block, except without WebGL) */}
            <div ref={deviceStepRef} role="group" aria-labelledby="device-title" className="py-3 short:py-2">
              <h3 id="device-title" className="mb-2">
                <StepHeading n={3} done={deviceDone}>
                  {ux.deviceTitle}
                </StepHeading>
              </h3>
              <DeviceCheck
                webgl={webgl}
                preload={preload}
                mic={mic.state}
                micRunning={mic.running}
                meterRef={meterRef}
                onMicTest={() => void mic.start()}
                onMicStop={mic.finish}
                onMicSkip={mic.skip}
              />
              {deviceError && webgl === "unsupported" && (
                <p className="mt-2 text-sm font-semibold text-danger">{ux.webglError}</p>
              )}
            </div>

            {/* 4. Consent: the whole box is the checkbox's label */}
            <div
              ref={consentStepRef}
              role="group"
              aria-labelledby="consent-title"
              onAnimationEnd={(e) => e.target === e.currentTarget && e.currentTarget.classList.remove("setup-shake")}
              className="py-3 short:py-2"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3">
                <h3 id="consent-title">
                  <StepHeading n={4} done={consent}>
                    {ux.consentTitle}
                  </StepHeading>
                </h3>
                <Link
                  href="/privacy"
                  className={`-my-2 inline-flex min-h-11 items-center rounded-control text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-strong ${FOCUS_RING}`}
                >
                  {ux.privacyLink}
                </Link>
              </div>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-control border-2 p-3 text-sm leading-snug text-ink transition-[border-color,background-color] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 ${
                  consent
                    ? "border-primary bg-primary-soft"
                    : consentError
                      ? "border-danger bg-danger-soft"
                      : "border-line-strong/70 bg-surface hover:border-ink-muted"
                }`}
              >
                <input
                  ref={consentBoxRef}
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    if (e.target.checked) setConsentError(false);
                  }}
                  aria-invalid={consentError || undefined}
                  aria-describedby="consent-error"
                  className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer accent-primary focus-visible:outline-none"
                />
                <span>{vi.setup.consent.label}</span>
              </label>
              <p id="consent-error" aria-live="polite" className="mt-2 text-sm font-semibold text-danger empty:hidden">
                {consentError && !consent ? ux.consentError : ""}
              </p>
            </div>
          </div>

          {/* Start area: bottom of the panel on desktop, a fixed bar on smaller screens. */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_-20px_rgba(16,35,31,0.35)] backdrop-blur lg:static lg:z-auto lg:rounded-b-tile lg:bg-surface lg:px-6 lg:pb-4 lg:pt-3 lg:shadow-none">
            {error && (
              <div
                role="alert"
                className="mb-3 flex items-start justify-between gap-3 rounded-control border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink"
              >
                <span className="py-2.5">{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className={`min-h-11 shrink-0 rounded-control px-2 font-semibold text-warning underline ${FOCUS_RING}`}
                >
                  {vi.setup.error.dismiss}
                </button>
              </div>
            )}
            <div className="mb-2 flex items-center justify-between gap-3 text-sm text-ink-muted">
              <p className="min-w-0 truncate">
                <span className="sr-only">{ux.summaryLabel}: </span>
                {summary}
              </p>
              <p className="hidden shrink-0 text-xs lg:block">
                <kbd className="rounded border border-line-strong bg-canvas px-1.5 py-0.5 font-sans font-semibold text-ink">
                  {ux.enterKey}
                </kbd>{" "}
                {ux.enterHint}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleStart()}
              aria-disabled={loading || undefined}
              aria-busy={loading || undefined}
              className={`flex h-14 w-full items-center justify-center gap-3 rounded-control bg-primary px-6 text-base font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition-[background-color,transform] duration-150 hover:bg-primary-strong active:translate-y-px ${FOCUS_RING} ${
                loading ? "cursor-progress" : ""
              }`}
            >
              {loading && (
                <span
                  aria-hidden="true"
                  className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
                />
              )}
              {loading ? ux.preparing : vi.setup.start}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
