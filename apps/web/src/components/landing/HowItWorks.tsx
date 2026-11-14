import vi from "../../../messages/vi.json";
import Tile from "@/components/ui/Tile";
import { HOW_IT_WORKS_ID } from "./HeroTile";

const L = vi.landing;

/** The three real steps of a session, in order (numbering encodes the sequence). */
export default function HowItWorks() {
  return (
    <section aria-labelledby="steps-title" id={HOW_IT_WORKS_ID} className="mt-12 scroll-mt-24">
      <h2 id="steps-title" className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {L.stepsTitle}
      </h2>
      <ol className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {L.steps.map((step, i) => (
          <Tile as="li" key={step.title} tone="surface" compact className="flex flex-col gap-3">
            <span
              className="tabular flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-base font-bold text-primary-strong"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <h3 className="text-xl font-bold">{step.title}</h3>
            <p className="leading-relaxed text-ink-muted">{step.body}</p>
          </Tile>
        ))}
      </ol>
    </section>
  );
}
