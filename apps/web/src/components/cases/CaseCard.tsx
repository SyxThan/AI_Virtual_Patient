import Image from "next/image";
import Link from "next/link";
import vi from "../../../messages/vi.json";
import Badge from "@/components/ui/Badge";
import { FOCUS_RING } from "@/components/ui/focus";
import { formatScore } from "@/components/history/format";
import { fmt } from "@/lib/sessionAuth";
import { formatAge, labelFor, type CatalogCase, type PracticeStat } from "./libraryHelpers";

const t = vi.cases.card;

function WarnIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path d="M8 2.5l6 11H2l6-11z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.5v3.2M8 11.6v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.8V8l2.2 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Token-colored stand-in when a case has no cover image (decorative). */
function CoverPlaceholder({ group }: { group: CatalogCase["catalog"]["patient_group"] }) {
  const tone =
    group === "child" ? "bg-sand-soft text-sand-ink" : group === "elderly" ? "bg-info-soft text-info" : "bg-mint-soft text-mint-ink";
  return (
    <div className={`flex h-full w-full items-center justify-center ${tone}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" className="h-14 w-14 opacity-70" fill="none">
        <circle cx="24" cy="16" r="7" stroke="currentColor" strokeWidth="2.5" />
        <path d="M10 40c1.8-8 7.6-12 14-12s12.2 4 14 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/**
 * One case in the library: the whole card is a single link to /setup?case=<id>
 * (no nested controls). It shows the chief complaint verbatim from the case and
 * patient facts, never the disease name unless the practice-only reveal is on
 * (`revealedName` is then the API's reveal=true title).
 */
export default function CaseCard({
  item,
  practice,
  signedIn,
  reveal,
  revealedName,
}: {
  item: CatalogCase;
  /** undefined: unknown (guest or still loading); otherwise the stat (count 0 = new). */
  practice: PracticeStat | undefined;
  signedIn: boolean;
  reveal: boolean;
  /** undefined: still loading; null: could not be loaded. */
  revealedName: string | null | undefined;
}) {
  const c = item.catalog;
  const p = item.patient;
  const group = vi.cases.filters.group[c.patient_group];
  const age = formatAge(p.age_value, p.age_unit, t.ageUnits);
  const sex = labelFor(p.sex, t.sex, t.sexUnknown);
  const informant = labelFor(p.informant_role, t.informant, t.informantOther);
  const exam = t.examMode[c.exam_mode];

  return (
    <li className="min-w-0">
      <Link
        href={`/setup?case=${encodeURIComponent(item.id)}`}
        className={`group flex h-full flex-col overflow-hidden rounded-tile bg-surface text-ink shadow-lift ring-1 ring-line/70 hover:ring-primary/50 ${FOCUS_RING}`}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-canvas">
          {/* Only local public paths (next/image has no remote hosts configured). The
              picture is decorative: the card's text already names the patient. */}
          {c.cover && c.cover.startsWith("/") && !c.cover.startsWith("//") ? (
            <Image
              src={c.cover}
              alt=""
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              // 2D covers are portrait exam figures: anchor the top so the face stays in the card.
              className={`object-cover ${c.exam_mode === "2d" ? "object-top" : "object-[50%_30%]"}`}
            />
          ) : (
            <CoverPlaceholder group={c.patient_group} />
          )}
          <span className="absolute left-3 top-3">
            <Badge tone="neutral" className="bg-surface/95">
              {exam}
            </Badge>
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-5">
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-primary">
            <span>{group}</span>
            <span>{age}</span>
            <span>{sex}</span>
          </p>

          {reveal && (
            <p className="text-sm text-ink-muted">
              <span className="font-semibold text-ink">{t.diagnosisLabel}: </span>
              {revealedName === undefined
                ? vi.cases.reveal.loading
                : (revealedName ?? vi.cases.reveal.unavailable)}
            </p>
          )}

          <h2 className="font-display text-xl font-bold leading-snug tracking-tight">
            &ldquo;{c.display_complaint}&rdquo;
          </h2>

          <div className="mt-auto flex flex-col gap-2 pt-1 text-sm text-ink-muted">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{informant}</span>
              {c.estimated_minutes != null && (
                <span className="inline-flex items-center gap-1">
                  <ClockIcon />
                  {fmt(t.minutes, { n: c.estimated_minutes })}
                </span>
              )}
            </p>
            {signedIn && practice !== undefined && (
              <p className="tabular flex flex-wrap gap-x-4 gap-y-1">
                {practice.count > 0 ? (
                  <>
                    <span>{fmt(t.practised, { n: practice.count })}</span>
                    {practice.lastScore != null && (
                      <span>{fmt(t.lastScore, { score: formatScore(practice.lastScore) })}</span>
                    )}
                  </>
                ) : (
                  <span>{t.new}</span>
                )}
              </p>
            )}
            {item.review_status === "draft" && (
              <span>
                <Badge tone="warning">
                  <WarnIcon />
                  {t.draft}
                </Badge>
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
