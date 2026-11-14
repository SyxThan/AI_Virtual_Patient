import type { HTMLAttributes } from "react";

export type BadgeTone = "neutral" | "primary" | "info" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-canvas text-ink-muted border-line",
  primary: "bg-primary-soft text-primary-strong border-primary-soft",
  info: "bg-info-soft text-info border-info-soft",
  success: "bg-success-soft text-success border-success-soft",
  warning: "bg-warning-soft text-warning border-warning-soft",
  danger: "bg-danger-soft text-danger border-danger-soft",
};

/** Small status pill. Color is never the only signal: always include text. */
export default function Badge({
  tone = "neutral",
  className = "",
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}
      {...rest}
    />
  );
}
