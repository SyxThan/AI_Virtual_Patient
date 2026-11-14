import Link from "next/link";
import vi from "../../../messages/vi.json";
import Card from "@/components/ui/Card";
import { FOCUS_RING } from "@/components/ui/focus";
import { InfoIcon } from "./icons";

const L = vi.landing;

/** Device requirements, the unreviewed-content notice (Hard rule 2) and the practice-feedback notice (ADR-0010). */
export default function LandingNotices() {
  return (
    <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card as="section" aria-labelledby="req-title">
        <h2 id="req-title" className="text-xl font-bold text-ink">
          {L.requirementsTitle}
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-muted">
          {L.requirements.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-col gap-4">
        <section
          aria-labelledby="draft-title"
          className="flex gap-3 rounded-card border border-warning/30 bg-warning-soft p-5 text-warning"
        >
          <InfoIcon />
          <div>
            <h2 id="draft-title" className="font-bold">
              {L.draftTitle}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink">{L.draftBody}</p>
          </div>
        </section>

        <section
          aria-labelledby="practice-title"
          className="flex gap-3 rounded-card border border-info/25 bg-info-soft p-5 text-info"
        >
          <InfoIcon />
          <div>
            <h2 id="practice-title" className="font-bold">
              {L.practiceTitle}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink">{L.practiceBody}</p>
            <Link
              href="/privacy"
              className={`mt-2 inline-flex min-h-11 items-center rounded-control text-sm font-semibold text-info underline underline-offset-4 ${FOCUS_RING}`}
            >
              {L.privacyLink}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
