import type { ReactNode } from "react";
import vi from "../../../messages/vi.json";
import Badge from "@/components/ui/Badge";
import Tile, { TILE_MUTED, type TileTone } from "@/components/ui/Tile";
import { fill, formatMeasuredAt } from "@/lib/evalsSummary";

const T = vi.transparency;

type Provenance = {
  source: string;
  measured_at: string | null;
  git_commit: string | null;
  model: string;
};

type MetricTileProps = {
  title: string;
  what: string;
  limits: string;
  command: string;
  tone?: TileTone;
  className?: string;
  /** null = no real measurement yet: the tile says so instead of showing a number. */
  provenance: Provenance | null;
  headline?: string;
  value?: string;
  children?: ReactNode;
};

/** One bento cell of the transparency page: a measured value with its provenance. */
export default function MetricTile({
  title,
  what,
  limits,
  command,
  tone = "surface",
  className = "",
  provenance,
  headline,
  value,
  children,
}: MetricTileProps) {
  const muted = TILE_MUTED[tone];
  return (
    <Tile as="article" tone={tone} compact className={`flex flex-col gap-4 ${className}`}>
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
        <p className={`text-sm leading-relaxed ${muted}`}>{what}</p>
      </header>

      {provenance ? (
        <>
          <div>
            <p className={`text-sm font-semibold ${muted}`}>{headline}</p>
            <p className="font-display tabular text-5xl font-bold tracking-tight">{value}</p>
          </div>
          {children && <div className="space-y-1 text-sm leading-relaxed">{children}</div>}
          <ul className={`mt-auto space-y-0.5 text-xs ${muted}`}>
            <li>{fill(T.measuredAt, { date: formatMeasuredAt(provenance.measured_at) })}</li>
            <li>{fill(T.model, { model: provenance.model })}</li>
            <li>{fill(T.commit, { commit: provenance.git_commit ?? "—" })}</li>
            <li className="break-all">{fill(T.source, { source: provenance.source })}</li>
          </ul>
        </>
      ) : (
        <div className="space-y-2">
          <Badge tone="neutral">{T.notMeasured}</Badge>
          <p className={`text-sm ${muted}`}>{T.notMeasuredHint}</p>
          <code className="block overflow-x-auto rounded-control bg-canvas px-3 py-2 text-xs text-ink">
            {command}
          </code>
        </div>
      )}

      <p className={`border-t border-line pt-3 text-xs leading-relaxed ${muted}`}>
        <span className="font-semibold">{T.limitsTitle}: </span>
        {limits}
      </p>
    </Tile>
  );
}
