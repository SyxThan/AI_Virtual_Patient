import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";
import { criterionAnchor } from "./debriefHelpers";

/**
 * Critical criterion missed: danger tone, with a heading and text (never color alone).
 * Lists the case's own missed critical criteria (from the API, not hard-coded per case);
 * each links to its row in the checklist.
 */
export default function RedFlagAlertBanner({
  missed,
}: {
  missed: { criterion_id: string; criterion: string }[];
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-4 rounded-tile border-2 border-danger bg-danger-soft p-5 text-danger sm:p-6"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger text-white">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3.5L2.5 20h19L12 3.5z" />
          <path d="M12 10v4.5M12 17.5v.01" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold tracking-tight">{vi.debrief.redFlagTitle}</p>
        <p className="mt-1 text-sm font-medium leading-relaxed">{vi.debrief.redFlagBody}</p>
        {missed.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2" aria-label={vi.debrief.redFlagListLabel}>
            {missed.map((c) => (
              <li key={c.criterion_id}>
                <a
                  href={`#${criterionAnchor(c.criterion_id)}`}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-control bg-surface px-3 py-2 text-sm font-semibold text-danger underline-offset-2 hover:underline ${FOCUS_RING}`}
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M8 3v10M4 9l4 4 4-4" />
                  </svg>
                  {c.criterion}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
