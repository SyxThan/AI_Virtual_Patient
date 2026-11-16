import type { ButtonHTMLAttributes } from "react";
import { FOCUS_RING, FOCUS_RING_DARK } from "./focus";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: `bg-primary text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] hover:-translate-y-0.5 hover:bg-[#0d7f79] ${FOCUS_RING}`,
  secondary: `border border-line-strong bg-surface text-ink hover:border-ink/40 hover:bg-canvas ${FOCUS_RING}`,
  ghost: `text-ink hover:bg-ink/5 ${FOCUS_RING}`,
  danger: `bg-danger text-white hover:bg-danger/90 ${FOCUS_RING}`,
  // On dark (ink) tiles.
  inverse: `bg-surface text-ink shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 hover:bg-primary-soft ${FOCUS_RING_DARK}`,
};

// Every size keeps a >= 44px touch target except `sm` (dense toolbars only).
const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-6 text-base",
};

/**
 * Class string for anything that looks like a button, including a `<Link>`:
 * `<Link href="/setup" className={buttonClass({ variant: "primary" })}>`.
 */
export function buttonClass({
  variant = "primary",
  size = "md",
  pill = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pill?: boolean;
  className?: string;
} = {}): string {
  return [
    // Only transform animates (--dur-fast); colors switch instantly. Press sinks 1px.
    "inline-flex items-center justify-center gap-2 font-semibold transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] active:translate-y-px motion-reduce:hover:translate-y-0",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0",
    pill ? "rounded-full" : "rounded-control",
    SIZES[size],
    VARIANTS[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pill?: boolean;
};

export default function Button({
  variant,
  size,
  pill,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, pill, className })} {...rest} />;
}
