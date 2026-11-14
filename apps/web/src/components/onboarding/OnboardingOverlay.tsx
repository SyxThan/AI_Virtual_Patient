"use client";

import { useRef, useState } from "react";
import vi from "../../../messages/vi.json";
import Modal from "@/components/ui/Modal";
import { buttonClass } from "@/components/ui/Button";
import { fmt } from "@/lib/sessionAuth";

export const ONBOARDING_SEEN_KEY = "avp_onboarding_seen_v1";

/** True when the first-run guide was already seen (or storage is unavailable). */
export function onboardingSeen(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_SEEN_KEY) === "1";
  } catch {
    return true; // blocked storage: do not nag on every visit
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * First-run guide for the workspace: 4 steps (ask, examine on the avatar,
 * vitals, finish). Skippable at any step; Escape also skips. Closing marks it
 * seen; the workspace header can reopen it.
 */
export default function OnboardingOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const steps = vi.onboarding.steps;
  const last = step === steps.length - 1;
  const current = steps[step];

  function close() {
    markOnboardingSeen();
    setStep(0);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={vi.onboarding.title}
      initialFocusRef={nextRef}
      closeOnBackdrop={false}
    >
      <p className="tabular mt-1 text-sm font-semibold text-primary">
        {fmt(vi.onboarding.stepOf, { n: step + 1, total: steps.length })}
      </p>
      <ol className="mt-3 flex gap-1.5" aria-hidden="true">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-line"}`}
          />
        ))}
      </ol>
      <div aria-live="polite" className="mt-4 rounded-card bg-canvas p-5">
        <h3 className="text-lg font-bold text-ink">{current.title}</h3>
        <p className="mt-2 leading-relaxed text-ink-muted">{current.body}</p>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={close} className={buttonClass({ variant: "ghost" })}>
          {vi.onboarding.skip}
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className={buttonClass({ variant: "secondary" })}
            >
              {vi.onboarding.back}
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={() => (last ? close() : setStep((s) => s + 1))}
            className={buttonClass({ variant: "primary" })}
          >
            {last ? vi.onboarding.done : vi.onboarding.next}
          </button>
        </div>
      </div>
    </Modal>
  );
}
