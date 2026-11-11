import Link from "next/link";
import vi from "../../messages/vi.json";
import SignedInLink from "@/components/ui/SignedInLink";
import { FOCUS_RING } from "@/components/ui/focus";

const L = vi.landing;

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9v5M10 6.2v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Hero */}
      <section aria-labelledby="hero-title" className="max-w-3xl">
        <p className="text-sm font-medium text-blue-800">{L.eyebrow}</p>
        <h1
          id="hero-title"
          className="mt-2 text-3xl font-semibold leading-tight text-gray-900 sm:text-4xl"
        >
          {L.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-gray-700 sm:text-lg">{L.lead}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/setup"
            className={`rounded-md bg-gray-900 px-5 py-2.5 font-medium text-white hover:bg-gray-700 ${FOCUS_RING}`}
          >
            {L.ctaStart}
          </Link>
          <SignedInLink
            href="/history"
            className={`rounded-md border border-gray-400 px-5 py-2.5 font-medium text-gray-900 hover:bg-gray-50 ${FOCUS_RING}`}
          >
            {L.ctaHistory}
          </SignedInLink>
        </div>
        <p className="mt-4 text-sm text-gray-700">
          <span className="font-medium">{L.caseLabel}:</span> {vi.setup.case.title}
        </p>
      </section>

      {/* How it works */}
      <section aria-labelledby="steps-title" className="mt-12">
        <h2 id="steps-title" className="text-xl font-semibold text-gray-900">
          {L.stepsTitle}
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {L.steps.map((step, i) => (
            <li key={step.title} className="rounded-lg border border-gray-200 bg-white p-5">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-700 text-sm font-semibold text-white"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold text-gray-900">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-700">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        {/* Device requirements */}
        <section
          aria-labelledby="req-title"
          className="rounded-lg border border-gray-200 bg-white p-5"
        >
          <h2 id="req-title" className="text-lg font-semibold text-gray-900">
            {L.requirementsTitle}
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
            {L.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-4">
          {/* Clinical content is unreviewed (Hard rule 2) */}
          <section
            aria-labelledby="draft-title"
            className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950"
          >
            <InfoIcon />
            <div>
              <h2 id="draft-title" className="font-semibold">
                {L.draftTitle}
              </h2>
              <p className="mt-1 text-sm leading-relaxed">{L.draftBody}</p>
            </div>
          </section>

          {/* Practice feedback only (ADR-0010) */}
          <section
            aria-labelledby="practice-title"
            className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-5 text-blue-950"
          >
            <InfoIcon />
            <div>
              <h2 id="practice-title" className="font-semibold">
                {L.practiceTitle}
              </h2>
              <p className="mt-1 text-sm leading-relaxed">{L.practiceBody}</p>
              <Link
                href="/privacy"
                className={`mt-2 inline-block rounded text-sm font-medium text-blue-900 underline ${FOCUS_RING}`}
              >
                {L.privacyLink}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
