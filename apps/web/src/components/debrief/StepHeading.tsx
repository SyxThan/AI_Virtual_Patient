import vi from "../../../messages/vi.json";
import { fmt } from "@/lib/sessionAuth";

/**
 * Numbered section heading: the debrief reads top to bottom as steps
 * (overview, feedback, checklist, general notes, next). The number is visual;
 * screen readers hear "Bước n" before the title.
 */
export default function StepHeading({
  n,
  id,
  title,
  aside,
}: {
  /** Omitted when the page has no numbered flow (loading, errors). */
  n?: number;
  id: string;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 id={id} className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight">
        {n !== undefined && (
          <>
            <span
              className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-base text-white"
              aria-hidden="true"
            >
              {n}
            </span>
            <span className="sr-only">{fmt(vi.debrief.sections.stepLabel, { n })}: </span>
          </>
        )}
        {title}
      </h2>
      {aside}
    </div>
  );
}
