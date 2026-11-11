import vi from "../../../messages/vi.json";

export type CriterionStatus = "met" | "partial" | "unmet" | "insufficient_evidence";

export const STATUS_ORDER: CriterionStatus[] = ["met", "partial", "unmet", "insufficient_evidence"];

export const STATUS_BADGE: Record<CriterionStatus, string> = {
  met: "bg-green-100 text-green-800 border-green-300",
  partial: "bg-yellow-100 text-yellow-800 border-yellow-300",
  unmet: "bg-red-100 text-red-800 border-red-300",
  insufficient_evidence: "bg-gray-100 text-gray-700 border-gray-300",
};

export const STATUS_BAR: Record<CriterionStatus, string> = {
  met: "bg-green-500",
  partial: "bg-yellow-400",
  unmet: "bg-red-500",
  insufficient_evidence: "bg-gray-400",
};

export function statusLabel(s: string): string {
  return (vi.debrief.status as Record<string, string>)[s] ?? s;
}
