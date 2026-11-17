import { EXAM_REGIONS, type ExamRegionId } from "../avatar/avatarContract.ts";

/**
 * Exam actions in the transcript. The backend (exam_service.py) records each
 * one as a student turn "[Khám - <label>] <action>" followed by a system turn
 * holding the case finding verbatim. The UI shows the pair as one compact
 * event line instead of two chat bubbles; the text itself is never altered.
 * Pure (no React, no JSON imports) so `node --test` can run it.
 */

export type ExamTarget = ExamRegionId | "observe_child";
export const EXAM_TARGETS: readonly ExamTarget[] = [...EXAM_REGIONS, "observe_child"];

/** Transcript labels written by the backend (`_ACTION_LABELS`), lowercase. */
const LABEL_TO_TARGET: Record<string, ExamTarget> = {
  "miệng - họng": "mouth_throat",
  "lòng bàn tay": "palm_hands",
  "lòng bàn chân": "feet",
  "mông - đầu gối": "buttocks_knees",
  "quan sát trẻ nằm yên": "observe_child",
};

const PREFIX = /^\[Khám - ([^\]]+)\]/;

/** Exam target of a student turn, or null when it is an ordinary question. */
export function examTargetOf(text: string): ExamTarget | null {
  const m = PREFIX.exec(text.trim());
  if (!m) return null;
  return LABEL_TO_TARGET[m[1].trim().toLowerCase()] ?? null;
}

export type TurnLike = { turn_idx: number; speaker: string; text: string };

export type TranscriptItem<T extends TurnLike> =
  | { kind: "turn"; turn: T }
  | { kind: "exam"; key: string; target: ExamTarget; finding: string | null; turnIdx: number };

/**
 * Folds exam pairs (student "[Khám - …]" + the system turn right after it) into
 * single events. A system turn without its student half is still shown as an
 * event when its predecessor is unknown, never dropped.
 */
export function foldTranscript<T extends TurnLike>(turns: readonly T[]): TranscriptItem<T>[] {
  const out: TranscriptItem<T>[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const target = t.speaker === "student" ? examTargetOf(t.text) : null;
    if (target) {
      const next = turns[i + 1];
      const finding = next?.speaker === "system" ? next.text : null;
      if (finding !== null) i += 1;
      out.push({ kind: "exam", key: `exam-${t.turn_idx}`, target, finding, turnIdx: t.turn_idx });
      continue;
    }
    out.push({ kind: "turn", turn: t });
  }
  return out;
}

/** Latest recorded finding per exam target (the transcript is the source of truth). */
export function latestFindings<T extends TurnLike>(turns: readonly T[]): Partial<Record<ExamTarget, string | null>> {
  const out: Partial<Record<ExamTarget, string | null>> = {};
  for (const item of foldTranscript(turns)) if (item.kind === "exam") out[item.target] = item.finding;
  return out;
}

/** Last thing the mother said, for the stage caption. */
export function lastPatientLine<T extends TurnLike>(turns: readonly T[]): T | null {
  for (let i = turns.length - 1; i >= 0; i--) if (turns[i].speaker === "patient") return turns[i];
  return null;
}
