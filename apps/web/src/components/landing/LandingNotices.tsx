import Link from "next/link";
import vi from "../../../messages/vi.json";
import Tile from "@/components/ui/Tile";
import { FOCUS_RING } from "@/components/ui/focus";
import { InfoIcon } from "./icons";

const L = vi.landing;

/**
 * Device requirements, the unreviewed-content notice (Hard rule 2) and the
 * practice-feedback notice (ADR-0010), as one quiet row before the footer.
 */
export default function LandingNotices() {
  return (
    <section aria-labelledby="notes-title" className="mt-14">
      <h2 id="notes-title" className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {L.notesTitle}
      </h2>
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Tile as="section" compact aria-labelledby="req-title" className="lg:row-span-2">
          <h3 id="req-title" className="font-display text-xl font-bold tracking-tight text-ink">
            {L.requirementsTitle}
          </h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-muted marker:text-primary">
            {L.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Tile>

        <section
          aria-labelledby="draft-title"
          className="flex gap-3 rounded-tile border border-warning/25 bg-warning-soft p-5 text-warning lg:col-span-2"
        >
          <InfoIcon />
          <div>
            <h3 id="draft-title" className="font-bold">
              {L.draftTitle}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink">{L.draftBody}</p>
          </div>
        </section>

        <section
          aria-labelledby="practice-title"
          className="flex gap-3 rounded-tile border border-info/20 bg-info-soft p-5 text-info lg:col-span-2"
        >
          <InfoIcon />
          <div>
            <h3 id="practice-title" className="font-bold">
              {L.practiceTitle}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink">{L.practiceBody}</p>
            <div className="mt-2 flex flex-wrap gap-x-5">
              <Link
                href="/privacy"
                className={`inline-flex min-h-11 items-center rounded-control text-sm font-semibold text-info underline underline-offset-4 ${FOCUS_RING}`}
              >
                {L.privacyLink}
              </Link>
              <Link
                href="/transparency"
                className={`inline-flex min-h-11 items-center rounded-control text-sm font-semibold text-info underline underline-offset-4 ${FOCUS_RING}`}
              >
                {vi.transparency.navLink}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
