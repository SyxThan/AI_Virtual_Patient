import type { ReactNode } from "react";
import vi from "../../../messages/vi.json";
import Badge from "@/components/ui/Badge";
import Tile, { TILE_MUTED, type TileTone } from "@/components/ui/Tile";
import { fill, formatMeasuredAt } from "@/lib/evalsSummary";

const T = vi.transparency;

type MetricTileProps = {
  title: string;
  /** One short caveat, always shown (what the number does not cover). */
  note: string;
  tone?: TileTone;
  /** null = no real measurement yet: the tile says so instead of showing a number. */
  measuredAt: string | null | undefined;
  measured: boolean;
  headline?: string;
  value?: string;
  children?: ReactNode;
};

/** One bento cell of the transparency page: the measured value, a few key facts, the date. */
export default function MetricTile({
  title,
  note,
  tone = "surface",
  measuredAt,
  measured,
  headline,
  value,
  children,
}: MetricTileProps) {
  const muted = TILE_MUTED[tone];
  return (
    <Tile as="article" tone={tone} compact className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>

      {measured ? (
        <>
          <div>
            <p className={`text-sm font-semibold ${muted}`}>{headline}</p>
            <p className="font-display tabular text-5xl font-bold tracking-tight">{value}</p>
          </div>
          {children && <div className="space-y-1 text-sm leading-relaxed">{children}</div>}
        </>
      ) : (
        <Badge tone="neutral" className="self-start">
          {T.notMeasured}
        </Badge>
      )}

      <div className={`mt-auto space-y-1 border-t border-line pt-3 text-xs leading-relaxed ${muted}`}>
        <p>{note}</p>
        {measured && <p>{fill(T.measuredAt, { date: formatMeasuredAt(measuredAt ?? null) })}</p>}
      </div>
    </Tile>
  );
}
