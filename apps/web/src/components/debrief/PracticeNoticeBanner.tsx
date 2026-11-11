import vi from "../../../messages/vi.json";

// Permanent notice (docs/specs/evaluation.md "What the student sees", ADR-0010).
export default function PracticeNoticeBanner({ sourcesReviewed }: { sourcesReviewed: boolean | null }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900" role="note">
      <p className="font-medium">{vi.debrief.practiceNotice}</p>
      {sourcesReviewed === false && (
        <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
          {vi.debrief.draftSources}
        </span>
      )}
    </div>
  );
}
