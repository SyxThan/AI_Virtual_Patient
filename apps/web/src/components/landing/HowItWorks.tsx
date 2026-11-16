import vi from "../../../messages/vi.json";
import { HOW_IT_WORKS_ID } from "./HeroTile";

const L = vi.landing;

/**
 * The three real steps of a session, in order: the numbering encodes the
 * sequence and a rail joins the steps on wide screens.
 */
export default function HowItWorks() {
  return (
    <section aria-labelledby="steps-title" id={HOW_IT_WORKS_ID} className="mt-14 scroll-mt-24">
      <h2 id="steps-title" className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {L.stepsTitle}
      </h2>
      <ol className="relative mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-4">
        <span
          aria-hidden="true"
          className="absolute left-5 top-0 hidden h-px w-[calc(100%-2.5rem)] bg-line-strong sm:top-5 sm:block"
        />
        {L.steps.map((step, i) => (
          <li key={step.title} className="relative flex gap-4 sm:flex-col sm:gap-5">
            <span
              className="font-display tabular relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-white ring-4 ring-canvas"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="sm:pr-6">
              <h3 className="font-display text-2xl font-bold tracking-tight">{step.title}</h3>
              <p className="mt-2 max-w-prose leading-relaxed text-ink-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
