import vi from "../../../messages/vi.json";
import Badge from "@/components/ui/Badge";

// Permanent notice (docs/specs/evaluation.md "What the student sees", ADR-0010).
export default function PracticeNoticeBanner({ sourcesReviewed }: { sourcesReviewed: boolean | null }) {
  return (
    <div
      className="flex items-start gap-3 rounded-card border border-info-soft bg-info-soft px-4 py-3 text-sm text-ink sm:px-5"
      role="note"
    >
      <svg
        viewBox="0 0 20 20"
        className="mt-0.5 h-5 w-5 shrink-0 text-info"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 9v5M10 6.2v.01" />
      </svg>
      <div className="min-w-0 space-y-1.5">
        <p className="font-medium">{vi.debrief.practiceNotice}</p>
        {sourcesReviewed === false && <Badge tone="warning">{vi.debrief.draftSources}</Badge>}
      </div>
    </div>
  );
}
