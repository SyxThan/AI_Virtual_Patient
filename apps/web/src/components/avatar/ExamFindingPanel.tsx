"use client";

import type { components } from "@/lib/api-client/schema";
import vi from "../../../messages/vi.json";

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
  if (!open) return null;

  const regionKey: RegionKey | null = result
    ? ((result.action === "observe_child" ? "observe_child" : result.region) as RegionKey | null)
    : null;
  const regionLabel = regionKey ? vi.exam.regions[regionKey] : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={vi.exam.panelTitle}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">{vi.exam.panelTitle}</p>
            <h2 className="text-lg font-semibold">{regionLabel}</h2>
          </div>
          {result?.red_flag && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              ⚠ {vi.exam.redFlag}
            </span>
          )}
        </div>

        {loading && <p className="text-sm text-gray-500">{vi.exam.loading}</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}

        {result && !loading && (
          <>
            {result.documented ? (
              <>
                {result.case_action && (
                  <p className="mb-2 text-xs text-gray-500">
                    {vi.exam.caseAction}: {result.case_action}
                  </p>
                )}
                <p className="text-xs font-medium text-gray-500">{vi.exam.finding}</p>
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
              <figcaption className="mt-1 text-center text-[11px] text-gray-500">
                {vi.exam.illustrative}
              </figcaption>
            </figure>

            {result.review_status !== "clinician_reviewed" && (
              <p className="mt-3 text-[11px] text-amber-700">⚠ {vi.exam.draft}</p>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          {vi.exam.close}
        </button>
      </div>
    </div>
  );
}
