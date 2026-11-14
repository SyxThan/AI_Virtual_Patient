import vi from "../../../messages/vi.json";
import type { BadgeTone } from "@/components/ui/Badge";

export type CriterionStatus = "met" | "partial" | "unmet" | "insufficient_evidence";

export const STATUS_ORDER: CriterionStatus[] = ["met", "partial", "unmet", "insufficient_evidence"];

/** Badge tone per status. Color is paired with the label text and an icon (never color only). */
export const STATUS_TONE: Record<CriterionStatus, BadgeTone> = {
  met: "success",
  partial: "warning",
  unmet: "danger",
  insufficient_evidence: "neutral",
};

/** Class string for status chips outside a Badge (kept for older call sites). */
export const STATUS_BADGE: Record<CriterionStatus, string> = {
  met: "bg-success-soft text-success border-success-soft",
  partial: "bg-warning-soft text-warning border-warning-soft",
  unmet: "bg-danger-soft text-danger border-danger-soft",
  insufficient_evidence: "bg-canvas text-ink-muted border-line",
};

export const STATUS_BAR: Record<CriterionStatus, string> = {
  met: "bg-success",
  partial: "bg-warning",
  unmet: "bg-danger",
  insufficient_evidence: "bg-line-strong",
};

export function statusTone(s: string): BadgeTone {
  return STATUS_TONE[s as CriterionStatus] ?? STATUS_TONE.insufficient_evidence;
}

export function statusLabel(s: string): string {
  return (vi.debrief.status as Record<string, string>)[s] ?? s;
}
