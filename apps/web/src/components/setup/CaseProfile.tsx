import Image from "next/image";
import vi from "../../../messages/vi.json";
import { buttonClass } from "@/components/ui/Button";
import { examModeOf, localCover, patientLine, type CaseSummary } from "@/lib/caseSummary";
import { fmt } from "@/lib/sessionAuth";
import { STAGE_TRANSITION_NAME } from "@/lib/stageTransition";

const COVER_FRAME =
  "relative aspect-video w-full overflow-hidden rounded-[20px] bg-sand-soft ring-1 ring-line/70 lg:aspect-[4/3] lg:max-w-[calc((100dvh-27.5rem)*4/3)] short:max-w-[calc((100dvh-29rem)*4/3)]";

/**
 * "HỒ SƠ CA": the chosen case, read like a chart cover (AVP-149). Everything
 * comes from `GET /cases/{id}` (no case text in vi.json): cover, specialty, the
 * presenting complaint verbatim as the heading, and patient facts. Like the
 * /cases library it never names the disease. The cover carries the stage's
 * view-transition name so it grows into the exam stage when the session starts.
 */
export default function CaseProfile({ data }: { data: CaseSummary }) {
  const ux = vi.setupUx;
  const t = vi.caseSetup;
  const cover = localCover(data);
  const minutes = data.catalog?.estimated_minutes;

  return (
    <section aria-labelledby="case-title" className="flex min-w-0 flex-col gap-3 lg:gap-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">{ux.profileLabel}</p>

      <div data-stage-transition style={{ viewTransitionName: STAGE_TRANSITION_NAME }} className={`setup-cover ${COVER_FRAME}`}>
        {cover ? (
          <Image
            src={cover}
            alt={t.coverAlt}
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="setup-breathe object-cover object-[50%_30%]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm font-semibold text-sand-ink">
            {t.noCover}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">{data.specialty}</p>
          <p className="mt-1 text-sm font-semibold text-ink-muted">{t.complaintLabel}</p>
          <h1
            id="case-title"
            className="font-display mt-0.5 text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl xl:text-5xl"
          >
            &ldquo;{data.catalog?.display_complaint ?? t.defaultCase}&rdquo;
          </h1>
          <p className="mt-2 text-base text-ink-muted">
            {patientLine(data)}
            {minutes != null && <> · {fmt(t.minutes, { n: minutes })}</>}
          </p>
        </div>

        {examModeOf(data) === "2d" && <p className="max-w-prose text-sm text-ink-muted">{t.exam2dNote}</p>}

        {data.review_status === "draft" && (
          <p className="flex max-w-prose items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-sm text-ink">
            <WarnIcon />
            {vi.setup.case.draftNotice}
          </p>
        )}
      </div>
    </section>
  );
}

/** Same frame as the profile, for loading / missing / not found / error. */
export function CaseProfileState({
  kind,
  onRetry,
}: {
  kind: "loading" | "missing" | "notFound" | "error";
  onRetry: () => void;
}) {
  const t = vi.caseSetup;
  if (kind === "loading") {
    return (
      <section aria-busy="true" className="flex min-w-0 flex-col gap-3 lg:gap-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">{vi.setupUx.profileLabel}</p>
        <div className={`${COVER_FRAME} animate-pulse motion-reduce:animate-none`} />
        <div className="h-10 w-3/4 animate-pulse rounded-control bg-canvas motion-reduce:animate-none" />
        <p className="sr-only" role="status">
          {t.loading}
        </p>
      </section>
    );
  }
  const title = kind === "missing" ? t.missingTitle : kind === "notFound" ? t.notFoundTitle : t.errorTitle;
  const body = kind === "missing" ? t.missingBody : kind === "notFound" ? t.notFoundBody : t.errorBody;
  return (
    <section aria-labelledby="case-title" className="flex min-w-0 flex-col items-start gap-3 rounded-tile bg-surface p-6 shadow-lift ring-1 ring-line/70">
      <h1 id="case-title" className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {title}
      </h1>
      <p className="max-w-prose text-ink-muted" role={kind === "error" ? "alert" : undefined}>
        {body}
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        {/* A plain <a>: /cases is its own page and may not exist on older builds. */}
        <a
          href="/cases"
className={buttonClass({ variant: "primary" })}>
          {t.toLibrary}
        </a>
        {kind === "error" && (
          <button
            type="button"
            onClick={onRetry}
className={buttonClass({ variant: "secondary" })}>
            {t.retry}
          </button>
        )}
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
