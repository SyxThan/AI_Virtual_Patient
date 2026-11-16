/**
 * Vitals shown on the landing monitor. They are the triage vitals of the demo
 * case (data/cases/case-01-hfmd.json, presentation.vitals); the case has no SpO2,
 * so it shows a dash. The pulse wobbles by 1-2 beats on screen only, as a live
 * monitor does.
 *
 * TODO(nhóm): duyệt số liệu lâm sàng (giá trị và biên độ dao động của mạch).
 */
export const DEMO_VITALS = {
  tempC: 39.2,
  pulse: 150,
  respRate: 32,
  spo2: null as number | null,
  /** Max on-screen deviation of the pulse from the case value, in beats per minute. */
  pulseWobble: 2,
} as const;
