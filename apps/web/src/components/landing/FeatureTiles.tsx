import type { ReactNode } from "react";
import vi from "../../../messages/vi.json";
import Tile, { TILE_MUTED, type TileTone } from "@/components/ui/Tile";
import SignedInLink from "@/components/ui/SignedInLink";
import { FOCUS_RING } from "@/components/ui/focus";
import TiltCard from "@/components/motion/TiltCard";
import { ChecklistArt, CitationArt, ExamArt, ProgressArt, VoiceArt } from "./FeatureArt";

const L = vi.landing;
const F = L.features;

type Big = { key: "voice" | "exam"; tone: TileTone; art: ReactNode };
type Small = { key: "osce" | "debrief" | "history"; art: ReactNode };

// The two things you do in the clinic are big, tinted and tilt toward the pointer.
const BIG: Big[] = [
  { key: "voice", tone: "mint", art: <VoiceArt /> },
  { key: "exam", tone: "sky", art: <ExamArt /> },
];
// What you get afterwards: no fill, separated only by rules.
const SMALL: Small[] = [
  { key: "osce", art: <ChecklistArt /> },
  { key: "debrief", art: <CitationArt /> },
  { key: "history", art: <ProgressArt /> },
];

/** Feature cells of the landing bento. Rendered as direct children of the grid. */
export default function FeatureTiles() {
  return (
    <>
      <h2 className="sr-only">{L.featuresTitle}</h2>
      {BIG.map(({ key, tone, art }) => (
        <TiltCard key={key} className="sm:col-span-1 lg:col-span-3">
          <Tile as="article" tone={tone} className="flex h-full flex-col gap-6">
            <span className={TILE_MUTED[tone]}>{art}</span>
            <div>
              <h3 className="font-display text-3xl font-bold tracking-tight">{F[key].title}</h3>
              <p className="mt-2 max-w-prose text-lg leading-relaxed">{F[key].body}</p>
            </div>
          </Tile>
        </TiltCard>
      ))}
      <div className="mt-4 grid grid-cols-1 sm:col-span-2 lg:col-span-6 lg:grid-cols-3">
        {SMALL.map(({ key, art }, i) => (
          <article
            key={key}
            className={`flex flex-col gap-4 border-t border-line-strong/60 py-6 lg:px-6 ${i === 0 ? "lg:pl-0" : "lg:border-l"}`}
          >
            <span className="text-primary">{art}</span>
            <h3 className="font-display text-2xl font-bold tracking-tight text-ink">{F[key].title}</h3>
            <p className="max-w-prose leading-relaxed text-ink-muted">{F[key].body}</p>
            {key === "history" && (
              <SignedInLink
                href="/history"
                className={`link-draw inline-flex min-h-11 items-center self-start rounded-control px-1 font-semibold text-primary hover:text-primary-strong ${FOCUS_RING}`}
              >
                {L.ctaHistory}
              </SignedInLink>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
