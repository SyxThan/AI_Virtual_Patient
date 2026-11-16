import Link from "next/link";
import vi from "../../../messages/vi.json";
import Tile from "@/components/ui/Tile";
import { buttonClass } from "@/components/ui/Button";
import { FOCUS_RING_DARK } from "@/components/ui/focus";
import ConversationStage from "./ConversationStage";

const L = vi.landing;

export const HOW_IT_WORKS_ID = "cach-hoat-dong";

/** The landing page's one bold cell: headline and start on the left, the conversation stage on the right. */
export default function HeroTile() {
  return (
    <Tile
      as="section"
      tone="ink"
      aria-labelledby="hero-title"
      className="overflow-hidden sm:col-span-2 lg:col-span-6"
    >
      <div className="stage-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="flex flex-col justify-between gap-8 lg:col-span-7">
          <div>
            <p className="text-sm font-semibold text-ink-inverse-muted">{L.eyebrow}</p>
            <h1
              id="hero-title"
              className="font-display mt-3 max-w-[14ch] text-balance text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl"
            >
              {L.title}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-inverse-muted sm:text-lg">
              {L.lead}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/setup" className={buttonClass({ variant: "inverse", size: "lg" })}>
                {L.ctaStart}
              </Link>
              <a
                href={`#${HOW_IT_WORKS_ID}`}
                className={`inline-flex min-h-11 items-center rounded-control px-1 font-semibold text-white underline decoration-ink-inverse-muted underline-offset-4 hover:decoration-white ${FOCUS_RING_DARK}`}
              >
                {L.howLink}
              </a>
            </div>
          </div>
          <p className="text-sm text-ink-inverse-muted">
            <span className="font-semibold text-white">{L.caseLabel}:</span> {vi.setup.case.title}
          </p>
        </div>
        <div className="lg:col-span-5">
          <ConversationStage />
        </div>
      </div>
    </Tile>
  );
}
