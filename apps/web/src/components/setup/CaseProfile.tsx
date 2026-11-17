import Image from "next/image";
import vi from "../../../messages/vi.json";
import { STAGE_TRANSITION_NAME } from "@/lib/stageTransition";

/**
 * "HỒ SƠ CA": the one MVP case, read like a chart cover. The picture is a still
 * render of the workspace's own clinic model (public/cases/hfmd-cover.webp,
 * "talk" camera view); it carries the stage's view-transition name so it grows
 * into the 3D stage when the session starts.
 *
 * The chips only restate facts already in the case summary (no new symptom or
 * vital sign), and none is colored as a red flag: spotting it is the learner's job.
 */
export default function CaseProfile() {
  const ux = vi.setupUx;
  return (
    <section aria-labelledby="case-title" className="flex min-w-0 flex-col gap-3 lg:gap-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">{ux.profileLabel}</p>

      <div
        data-stage-transition
        style={{ viewTransitionName: STAGE_TRANSITION_NAME }}
        className="setup-cover relative aspect-video w-full overflow-hidden rounded-[20px] bg-sand-soft ring-1 ring-line/70 lg:aspect-[4/3] lg:max-w-[calc((100dvh-27.5rem)*4/3)] short:max-w-[calc((100dvh-29rem)*4/3)]"
      >
        <Image
          src="/cases/hfmd-cover.webp"
          alt={ux.coverAlt}
          fill
          priority
          sizes="(min-width: 1024px) 55vw, 100vw"
          className="setup-breathe object-cover object-[50%_30%]"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">{ux.specialty}</p>
          <h1
            id="case-title"
            className="font-display mt-1 text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl xl:text-5xl"
          >
            {ux.caseName}
          </h1>
          <p className="mt-1 text-base text-ink-muted">{ux.caseSubline}</p>
        </div>

        {/* Reason for the visit: verbatim case summary. Collapsed on small screens to keep the steps close. */}
        <details className="group lg:hidden">
          <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control text-sm font-semibold text-primary">
            {ux.reasonTitle}
            <svg viewBox="0 0 20 20" className="h-4 w-4 transition-transform group-open:rotate-180" fill="none" aria-hidden="true">
              <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <p className="mt-1 max-w-prose leading-relaxed text-ink">{vi.setup.case.summary}</p>
        </details>
        <div className="hidden lg:block">
          <h2 className="sr-only">{ux.reasonTitle}</h2>
          <p className="max-w-prose leading-relaxed text-ink">{vi.setup.case.summary}</p>
        </div>

        <ul aria-label={ux.chipsLabel} className="flex flex-wrap gap-2">
          {ux.chips.map((c) => (
            <li
              key={c}
              className="rounded-full bg-sand-soft px-3 py-1.5 text-sm font-semibold text-sand-ink ring-1 ring-sand-ink/15"
            >
              {c}
            </li>
          ))}
        </ul>

        <p className="flex max-w-prose items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-sm text-ink">
          <WarnIcon />
          {vi.setup.case.draftNotice}
        </p>
      </div>
    </section>
  );
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-warning" fill="none" aria-hidden="true">
      <path d="M10 3l7.5 13h-15L10 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 8.5v3.5M10 14.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
