import type { ReactNode } from "react";
import vi from "../../../messages/vi.json";
import Tile, { TILE_MUTED, type TileTone } from "@/components/ui/Tile";
import SignedInLink from "@/components/ui/SignedInLink";
import { FOCUS_RING } from "@/components/ui/focus";
import { BookIcon, ChecklistIcon, HandIcon, HistoryIcon, MicIcon, PulseIcon } from "./icons";

const L = vi.landing;
const F = L.features;

type Feature = {
  key: keyof typeof F;
  tone: TileTone;
  icon: ReactNode;
  span: string;
};

// Layout on lg (6 columns): voice and exam sit beside the hero; the rest fill rows of three.
const FEATURES: Feature[] = [
  { key: "voice", tone: "mint", icon: <MicIcon />, span: "lg:col-span-2" },
  { key: "exam", tone: "sky", icon: <HandIcon />, span: "lg:col-span-2" },
  { key: "vitals", tone: "sand", icon: <PulseIcon />, span: "lg:col-span-2" },
  { key: "osce", tone: "surface", icon: <ChecklistIcon />, span: "lg:col-span-2" },
  { key: "debrief", tone: "mint", icon: <BookIcon />, span: "lg:col-span-2" },
  {
    key: "history",
    tone: "surface",
    icon: <HistoryIcon />,
    // sm: pairs with debrief; lg: a full-width strip under the grid.
    span:"lg:col-span-6 lg:flex-row lg:items-center lg:gap-6",
  },
];

/** Feature cells of the landing bento. Rendered as direct children of the grid. */
export default function FeatureTiles() {
  return (
    <>
      <h2 className="sr-only">{L.featuresTitle}</h2>
      {FEATURES.map(({ key, tone, icon, span }) => (
        <Tile key={key} as="article" tone={tone} compact className={`flex flex-col gap-3 ${span}`}>
          <span className={TILE_MUTED[tone]}>{icon}</span>
          <h3 className={`text-xl font-bold ${key === "history" ? "lg:w-56 lg:shrink-0" : ""}`}>{F[key].title}</h3>
          <p className={`max-w-prose leading-relaxed lg:flex-1 ${tone === "surface" ? TILE_MUTED.surface : ""}`}>
            {F[key].body}
          </p>
          {key === "history" && (
            <SignedInLink
              href="/history"
              className={`mt-1 inline-flex min-h-11 items-center self-start rounded-control lg:mt-0 lg:self-center font-semibold text-primary underline underline-offset-4 hover:text-primary-strong ${FOCUS_RING}`}
            >
              {L.ctaHistory}
            </SignedInLink>
          )}
        </Tile>
      ))}
    </>
  );
}
