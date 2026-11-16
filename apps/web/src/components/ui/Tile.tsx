import type { ElementType, HTMLAttributes } from "react";

/**
 * Bento tile tones. Each pairs a background with a text color that passes 4.5:1.
 * `ink` and `primary` are stages (gradient, glow): at most one or two per screen.
 * `surface` is lifted (hairline + one soft shadow); the tinted tones stay flat so
 * the eye reads "raised = content, tinted = context".
 */
export type TileTone = "surface" | "ink" | "primary" | "mint" | "sky" | "sand";

const TONES: Record<TileTone, string> = {
  surface: "bg-surface text-ink ring-1 ring-line/70 shadow-lift",
  ink: "tile-ink text-white shadow-stage",
  primary: "tile-primary text-white",
  mint: "bg-mint-soft text-mint-ink",
  sky: "bg-info-soft text-ink",
  sand: "bg-sand-soft text-sand-ink",
};

/** Muted secondary text per tone (labels, captions inside a tile). */
export const TILE_MUTED: Record<TileTone, string> = {
  surface: "text-ink-muted",
  ink: "text-ink-inverse-muted",
  primary: "text-primary-soft",
  mint: "text-mint-ink",
  sky: "text-info",
  sand: "text-sand-ink",
};

type TileProps = HTMLAttributes<HTMLElement> & {
  tone?: TileTone;
  as?: ElementType;
  /** Tighter padding for small tiles. */
  compact?: boolean;
};

/** One cell of a bento grid. Place it in a CSS grid and span it with col-span/row-span. */
export default function Tile({
  tone = "surface",
  as: Tag = "div",
  compact = false,
  className = "",
  ...rest
}: TileProps) {
  return (
    <Tag
      className={`relative rounded-tile ${compact ? "p-5" : "p-6 sm:p-8"} ${TONES[tone]} ${className}`}
      {...rest}
    />
  );
}
