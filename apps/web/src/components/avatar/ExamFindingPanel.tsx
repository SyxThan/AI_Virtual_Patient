"use client";

import { useRef } from "react";
import type { components } from "@/lib/api-client/schema";
import vi from "../../../messages/vi.json";
import Modal from "@/components/ui/Modal";
import { FOCUS_RING } from "@/components/ui/focus";

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
          <p className="mb-2 w-fit rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            <span aria-hidden="true">⚠ </span>
            {vi.exam.redFlag}
          </p>
        )}

        {loading && (
          <p role="status" className="text-sm text-gray-700">
            {vi.exam.loading}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        )}

        {result && !loading && (
          <>
            {result.documented ? (
              <>
                {result.case_action && (
                  <p className="mb-2 text-xs text-gray-600">
                    {vi.exam.caseAction}: {result.case_action}
                  </p>
                )}
                <p className="text-xs font-medium text-gray-600">{vi.exam.finding}</p>
                <p className="mt-1 whitespace-pre-line text-base text-gray-900">{result.finding}</p>
              </>
            ) : (
              <p className="text-sm text-gray-700">{vi.exam.unknown}</p>
            )}

            {/* TODO(clinician): replace this illustration with a reviewed clinical
                photograph once one with documented rights exists for this region. */}
            <figure className="mt-4">
              <svg
                viewBox="0 0 120 60"
                className="h-24 w-full rounded border border-dashed border-gray-300 bg-gray-50"
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
              <figcaption className="mt-1 text-center text-xs text-gray-600">
                {vi.exam.illustrative}
              </figcaption>
            </figure>

            {result.review_status !== "clinician_reviewed" && (
              <p className="mt-3 text-xs text-amber-800">
                <span aria-hidden="true">⚠ </span>
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
        className={`mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 ${FOCUS_RING}`}
      >
        {vi.exam.close}
      </button>
    </Modal>
  );
}
