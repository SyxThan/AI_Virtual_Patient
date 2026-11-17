"use client";

import { createContext, useContext } from "react";
import vi from "../../../messages/vi.json";
import { patientLine, type CaseSummary } from "@/lib/caseSummary";
import { fmt } from "@/lib/sessionAuth";

/**
 * Who answers the student in this session's case (AVP-149/150): the mother in
 * the HFMD case, the patient themself in an adult case, ... Workspace copy that
 * names the speaker reads it from here, so a non-HFMD case never says "người mẹ".
 * The title is the non-revealing patient line, never the diagnosis.
 */
export type CaseVoice = {
  /** Lowercase speaker noun, e.g. "người mẹ". */
  who: string;
  /** Sentence-start form, e.g. "Người mẹ". */
  Who: string;
  /** Example first question for the empty transcript. */
  example: string;
  /** Workspace header title. */
  title: string;
};

const t = vi.caseSetup;
const speakers = t.speaker as Record<string, string>;
const examples = t.askExample as Record<string, string>;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function voiceFor(role: string, title: string): CaseVoice {
  const who = speakers[role] ?? speakers.other;
  return { who, Who: capitalize(who), example: examples[role] ?? examples.other, title };
}

/** Before the case loads (or if it fails): neutral wording, generic title. */
export const NEUTRAL_VOICE: CaseVoice = voiceFor("other", t.workspaceTitle);

export function caseVoiceOf(c: CaseSummary | null | undefined): CaseVoice {
  if (!c) return NEUTRAL_VOICE;
  return voiceFor(c.patient.informant_role, patientLine(c));
}

export const CaseVoiceContext = createContext<CaseVoice>(NEUTRAL_VOICE);

export function useCaseVoice(): CaseVoice {
  return useContext(CaseVoiceContext);
}

/** Fill a vi.json string that names the speaker ({who} / {Who}). */
export function speakerText(template: string, v: CaseVoice, extra: Record<string, string> = {}): string {
  return fmt(template, { who: v.who, Who: v.Who, example: v.example, ...extra });
}
