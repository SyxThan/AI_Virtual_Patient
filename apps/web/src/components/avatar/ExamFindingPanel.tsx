"use client";

import { useRef } from "react";
import type { components } from "@/lib/api-client/schema";
import vi from "../../../messages/vi.json";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";

export type ExamActionResponse = components["schemas"]["ExamActionResponse"];
type RegionKey = keyof typeof vi.exam.regions;

/**
 * Shows the result of one exam action. The finding text is the case JSON's
 * `exam[].finding`, verbatim (from the backend). The picture is a plainly
 * labelled ILLUSTRATION — there are no reviewed clinical photographs yet.
 */
export default function ExamFindingPanel({
  open,
  result,
  loading,
  error,
  onClose,
}: {
  open: boolean;
  result: ExamActionResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const regionKey: RegionKey | null = result
    ? ((result.action === "observe_child" ? "observe_child" : result.region) as RegionKey | null)
    : null;
  const regionLabel = regionKey ? vi.exam.regions[regionKey] : "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={regionLabel ? `${vi.exam.panelTitle}: ${regionLabel}` : vi.exam.panelTitle}
      initialFocusRef={closeRef}
      showClose={false}
    >
      <div aria-live="polite" className="mt-3">
        {result?.red_flag && !loading && (
          <Badge tone="danger" className="mb-3">
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
              <path d="M6 2v5M6 9.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {vi.exam.redFlag}
          </Badge>
        )}

        {loading && (
          <p role="status" className="flex items-center gap-3 text-sm text-ink-muted">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary motion-reduce:animate-none"
              aria-hidden="true"
            />
            {vi.exam.loading}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink"
          >
            {error}
          </p>
        )}

        {result && !loading && (
          <>
            {result.documented ? (
              <div className="rounded-card bg-canvas p-4">
                {result.case_action && (
                  <p className="mb-2 text-sm text-ink-muted">
                    {vi.exam.caseAction}: {result.case_action}
                  </p>
                )}
                <p className="text-sm font-semibold text-ink-muted">{vi.exam.finding}</p>
                <p className="mt-1 whitespace-pre-line text-base leading-relaxed text-ink">
                  {result.finding}
                </p>
              </div>
            ) : (
              <p className="rounded-card bg-canvas p-4 text-sm leading-relaxed text-ink">
                {vi.exam.unknown}
              </p>
            )}

            {/* TODO(clinician): replace this illustration with a reviewed clinical
                photograph once one with documented rights exists for this region. */}
            <figure className="mt-4">
              <svg
                viewBox="0 0 120 60"
                className="h-24 w-full rounded-card border border-dashed border-line-strong bg-sand-soft"
                aria-hidden="true"
              >
                <ellipse cx="60" cy="30" rx="40" ry="18" fill="#f2c6a5" />
                {result.documented &&
                  [20, 34, 48, 62, 76, 90].map((x, i) => (
                    <circle
                      key={x}
                      cx={x + (i % 2 ? 3 : -3)}
                      cy={i % 2 ? 26 : 34}
                      r="3.5"
                      fill="#e7a3a3"
                    />
                  ))}
              </svg>
              <figcaption className="mt-1.5 text-center text-sm text-ink-muted">
                {vi.exam.illustrative}
              </figcaption>
            </figure>

            {result.review_status !== "clinician_reviewed" && (
              <p className="mt-3 flex items-start gap-2 text-sm text-warning">
                <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0" fill="none" aria-hidden="true">
                  <path d="M10 3l7.5 13h-15L10 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M10 8.5v3.5M10 14.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                {vi.exam.draft}
              </p>
            )}
          </>
        )}
      </div>

      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className={buttonClass({ variant: "primary", className: "mt-5 w-full sm:w-auto" })}
      >
        {vi.exam.close}
      </button>
    </Modal>
  );
}
