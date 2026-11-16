// Shape of src/data/evals-summary.json, written only by evals/publish_summary.py
// (AVP-139). Every value is a measurement from evals/results/; null = not measured.
import raw from "@/data/evals-summary.json";
import vi from "../../messages/vi.json";

type Meta = { source: string; measured_at: string | null; git_commit: string | null };

export type LatencyResult = Meta & {
  providers: Record<string, string>;
  setup: string;
  turns: number;
  turns_with_errors: number;
  first_audio_p50: number | null;
  first_audio_p95: number | null;
  first_text_p50: number | null;
  stt_p50: number | null;
  llm_p50: number | null;
  tts_p50: number | null;
  target_ms: number;
  target_met: boolean | null;
};

export type RepeatabilityResult = Meta & {
  models: string[];
  runs_per_transcript: number;
  transcripts: number;
  criterion_cells: number;
  identical_all_runs_rate: number | null;
  mean_modal_agreement: number | null;
  max_total_score_range: number | null;
};

export type RedteamResult = Meta & {
  model: string;
  prompts: number;
  completed: number;
  passed: number;
  pass_rate: number | null;
  by_category: Record<string, { n: number; passed: number }>;
};

export type JudgeResult = Meta & {
  patient_model: string;
  judge_model: string;
  judged: number;
  unsupported_per_100: number | null;
  gated_leaks_per_100: number | null;
  audit_labelled: number;
  audit_agreement: number | null;
  audit_missed_unsupported: number;
};

export type EvalsSummary = {
  generated_by: string;
  latency: { voice: LatencyResult | null; text: LatencyResult | null };
  repeatability: RepeatabilityResult | null;
  redteam: RedteamResult | null;
  judge: JudgeResult | null;
};

export const evalsSummary = raw as EvalsSummary;

/** Replace `{key}` placeholders in a vi.json string. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

const MEASURED_FMT = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function formatMeasuredAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : MEASURED_FMT.format(d);
}

/** Milliseconds as "820 ms" or "1,4 giây"; "—" when not measured. */
export function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  const u = vi.transparency.units;
  if (ms < 1000) return fill(u.ms, { value: ms.toLocaleString("vi-VN") });
  return fill(u.s, { value: (ms / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) });
}

/** A 0..1 rate as a Vietnamese percentage ("96,3%"); "—" when not measured. */
export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

export function formatNumber(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}
