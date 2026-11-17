import type { CSSProperties } from "react";
import vi from "../../../messages/vi.json";
import Tile from "@/components/ui/Tile";
import { FOCUS_RING_DARK } from "@/components/ui/focus";
import ConversationStage from "./ConversationStage";
import EcgMonitor from "./EcgMonitor";
import { HOW_IT_WORKS_ID } from "./ids";
import StartCta from "./StartCta";

const L = vi.landing;

/**
 * The landing hero. Server component; only the monitor, the sample conversation
 * and the start button are client islands. Opening sequence (~2.5 s, once): the
 * title lines slide up from behind their masks 90 ms apart, the lead and buttons
 * fade in 150 ms after the last line, the ECG draws itself, then runs live.
 * All initial hidden states sit behind `.js` (globals.css).
 */
export default function HeroTile() {
  return (
    <Tile as="section" tone="ink" aria-labelledby="hero-title" className="overflow-hidden sm:col-span-2 lg:col-span-6">
      <div className="stage-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-10 lg:col-span-7">
          <div>
            <p className="text-sm font-semibold text-ink-inverse-muted">
              {L.eyebrow}
            </p>
            <h1
              id="hero-title"
              className="font-display mt-4 text-[clamp(40px,5.5vw,76px)] font-bold leading-[1.02] tracking-tight"
            >
              {L.titleLines.map((line, i) => (
                <span key={line} className="hero-line">
                  <span style={{ "--i": i } as CSSProperties}>{line}</span>
                </span>
              ))}
            </h1>
            <div className="hero-after" style={{ "--lines": L.titleLines.length } as CSSProperties}>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-inverse-muted sm:text-lg">{L.lead}</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <StartCta />
                <a
                  href={`#${HOW_IT_WORKS_ID}`}
                  className={`link-draw inline-flex min-h-11 items-center rounded-control px-1 font-semibold text-white ${FOCUS_RING_DARK}`}
                >
                  {L.howLink}
                </a>
              </div>
            </div>
          </div>
          <div>
            <EcgMonitor />
            <p className="mt-6 text-sm text-ink-inverse-muted">
              <span className="font-semibold text-white">{L.caseLabel}:</span> {vi.setup.case.title}
            </p>
          </div>
        </div>
        <div className="min-w-0 lg:col-span-5">
          <ConversationStage />
        </div>
      </div>
    </Tile>
  );
}
