import type { ReactNode } from "react";
import vi from "../../../messages/vi.json";
import Tile, { TILE_MUTED, type TileTone } from "@/components/ui/Tile";
import SignedInLink from "@/components/ui/SignedInLink";
import { FOCUS_RING } from "@/components/ui/focus";
import { ChecklistGlyph, CitedPageGlyph, HandGlyph, ProgressGlyph, WaveGlyph } from "./glyphs";

const L = vi.landing;
const F = L.features;

type Feature = {
  key: keyof typeof F;
  tone: TileTone;
  glyph: ReactNode;
  span: string;
};

// Layout on lg (6 columns): three feature cells in a row, then the debrief and history cells.
const FEATURES: Feature[] = [
  { key: "voice", tone: "mint", glyph: <WaveGlyph />, span: "lg:col-span-2" },
  { key: "exam", tone: "sky", glyph: <HandGlyph />, span: "lg:col-span-2" },
  { key: "osce", tone: "surface", glyph: <ChecklistGlyph />, span: "lg:col-span-2" },
  { key: "debrief", tone: "sand", glyph: <CitedPageGlyph />, span: "lg:col-span-3" },
  { key: "history", tone: "surface", glyph: <ProgressGlyph />, span: "lg:col-span-3" },
];

/** Feature cells of the landing bento. Rendered as direct children of the grid. */
export default function FeatureTiles() {
  return (
    <>
      <h2 className="sr-only">{L.featuresTitle}</h2>
      {FEATURES.map(({ key, tone, glyph, span }) => (
        <Tile key={key} as="article" tone={tone} compact className={`flex flex-col gap-4 ${span}`}>
          <span className={`${TILE_MUTED[tone]} ${tone === "surface" ? "text-primary" : ""}`}>{glyph}</span>
          <div className="flex flex-1 flex-col gap-2">
            <h3 className="font-display text-2xl font-bold tracking-tight">{F[key].title}</h3>
            <p className={`max-w-prose leading-relaxed ${tone === "surface" ? TILE_MUTED.surface : ""}`}>
              {F[key].body}
            </p>
          </div>
          {key === "history" && (
            <SignedInLink
              href="/history"
              className={`inline-flex min-h-11 items-center self-start rounded-control font-semibold text-primary underline underline-offset-4 hover:text-primary-strong ${FOCUS_RING}`}
            >
              {L.ctaHistory}
            </SignedInLink>
          )}
        </Tile>
      ))}
    </>
  );
}
