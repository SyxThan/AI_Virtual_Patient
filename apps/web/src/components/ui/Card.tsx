import type { ElementType, HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  padded?: boolean;
};

/**
 * A plain content surface (forms, lists, panels). Smaller radius than a bento Tile
 * so hierarchy reads: tiles frame a screen, cards hold content inside it.
 */
export default function Card({ as: Tag = "section", padded = true, className = "", ...rest }: CardProps) {
  return (
    <Tag
      className={`rounded-card border border-line bg-surface ${padded ? "p-5 sm:p-6" : ""} ${className}`}
      {...rest}
    />
  );
}
