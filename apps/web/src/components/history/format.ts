import vi from "../../../messages/vi.json";

const DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});
const SHORT_DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE_FMT.format(d);
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : SHORT_DATE_FMT.format(d);
}

/** Score with at most one decimal, Vietnamese decimal comma. */
export function formatScore(score: number): string {
  return score.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

export function modeLabel(mode: string): string {
  return (vi.history.mode as Record<string, string>)[mode] ?? mode;
}

export function statusLabel(status: string): string {
  return (vi.history.status as Record<string, string>)[status] ?? status;
}

export function evaluationLabel(status: string): string {
  return (vi.history.evaluation as Record<string, string>)[status] ?? status;
}
