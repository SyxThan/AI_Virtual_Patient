import Link from "next/link";
import vi from "../../../messages/vi.json";
import Tile from "@/components/ui/Tile";
import { buttonClass } from "@/components/ui/Button";
import { FOCUS_RING_DARK } from "@/components/ui/focus";
import MonitorTrace from "./MonitorTrace";

const L = vi.landing;

export const HOW_IT_WORKS_ID = "cach-hoat-dong";

/** The landing page's one bold cell: headline, the start CTA and a monitor strip. */
export default function HeroTile() {
  return (
    <Tile
      as="section"
      tone="ink"
      aria-labelledby="hero-title"
      className="flex flex-col justify-between gap-8 overflow-hidden sm:col-span-2 lg:col-span-4 lg:row-span-2"
    >
      <div className="max-w-2xl">
        <h1
          id="hero-title"
          className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl"
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
      <div>
        <MonitorTrace />
        <p className="mt-4 text-sm text-ink-inverse-muted">
          <span className="font-semibold text-white">{L.caseLabel}:</span> {vi.setup.case.title}
        </p>
      </div>
    </Tile>
  );
}
