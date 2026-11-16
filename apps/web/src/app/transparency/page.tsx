import type { Metadata } from "next";
import Link from "next/link";
import vi from "../../../messages/vi.json";
import MetricTile from "@/components/transparency/MetricTile";
import Badge from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageShell from "@/components/ui/PageShell";
import {
  evalsSummary,
  fill,
  formatMs,
  formatNumber,
  formatRate,
} from "@/lib/evalsSummary";

// Every number here comes from src/data/evals-summary.json, written by
// evals/publish_summary.py from real (non-fake) results in evals/results/
// (Hard rule 3, AVP-139). Nothing on this page is typed in by hand.
export const metadata: Metadata = { title: vi.transparency.title };

const T = vi.transparency;
const CATEGORIES = T.redteam.categories as Record<string, string>;

export default function TransparencyPage() {
  const { latency, repeatability: rep, redteam: rt, judge } = evalsSummary;
  const lat = latency.voice ?? latency.text;
  const latMode = latency.voice ? T.latency.modeVoice : T.latency.modeText;

  return (
    <PageShell width="default">
      <header className="mb-8 space-y-3">
        <Badge tone="info">{T.badge}</Badge>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{T.title}</h1>
        <p className="max-w-[68ch] text-ink-muted">{T.intro}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricTile
          tone="mint"
          title={T.latency.title}
          what={T.latency.what}
          limits={T.latency.limits}
          command={T.latency.command}
          provenance={
            lat && {
              source: lat.source,
              measured_at: lat.measured_at,
              git_commit: lat.git_commit,
              model: Object.values(lat.providers).join(", "),
            }
          }
          headline={fill(T.latency.headline, { mode: latMode })}
          value={lat ? formatMs(lat.first_audio_p50) : undefined}
        >
          {lat && (
            <>
              <p>{fill(T.latency.p95, { value: formatMs(lat.first_audio_p95) })}</p>
              <p>{fill(T.latency.target, { value: formatMs(lat.target_ms) })}</p>
              {lat.target_met !== null && (
                <p className="font-semibold">
                  {lat.target_met ? T.latency.met : T.latency.notMet}
                </p>
              )}
              <p>
                {fill(T.latency.parts, {
                  stt: formatMs(lat.stt_p50),
                  llm: formatMs(lat.llm_p50),
                  tts: formatMs(lat.tts_p50),
                })}
              </p>
              <p>{fill(T.latency.turns, { n: lat.turns, errors: lat.turns_with_errors })}</p>
            </>
          )}
        </MetricTile>

        <MetricTile
          tone="sky"
          title={T.repeatability.title}
          what={T.repeatability.what}
          limits={T.repeatability.limits}
          command={T.repeatability.command}
          provenance={
            rep && {
              source: rep.source,
              measured_at: rep.measured_at,
              git_commit: rep.git_commit,
              model: rep.models.join(", "),
            }
          }
          headline={T.repeatability.headline}
          value={rep ? formatRate(rep.identical_all_runs_rate) : undefined}
        >
          {rep && (
            <>
              <p>
                {fill(T.repeatability.agreement, { value: formatRate(rep.mean_modal_agreement) })}
              </p>
              <p>
                {fill(T.repeatability.range, { value: formatNumber(rep.max_total_score_range) })}
              </p>
              <p>
                {fill(T.repeatability.runs, {
                  transcripts: rep.transcripts,
                  runs: rep.runs_per_transcript,
                })}
              </p>
            </>
          )}
        </MetricTile>

        <MetricTile
          tone="sand"
          title={T.redteam.title}
          what={T.redteam.what}
          limits={T.redteam.limits}
          command={T.redteam.command}
          provenance={
            rt && {
              source: rt.source,
              measured_at: rt.measured_at,
              git_commit: rt.git_commit,
              model: rt.model,
            }
          }
          headline={T.redteam.headline}
          value={rt ? formatRate(rt.pass_rate) : undefined}
        >
          {rt && (
            <>
              <p className="font-semibold">
                {fill(T.redteam.count, { passed: rt.passed, n: rt.completed })}
              </p>
              <ul className="space-y-0.5">
                {Object.entries(rt.by_category).map(([cat, v]) => (
                  <li key={cat} className="flex justify-between gap-2">
                    <span>{CATEGORIES[cat] ?? cat}</span>
                    <span className="tabular shrink-0 whitespace-nowrap font-semibold">
                      {fill(T.redteam.count, { passed: v.passed, n: v.n })}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </MetricTile>

        <MetricTile
          title={T.judge.title}
          what={T.judge.what}
          limits={T.judge.limits}
          command={T.judge.command}
          provenance={
            judge && {
              source: judge.source,
              measured_at: judge.measured_at,
              git_commit: judge.git_commit,
              model: `${judge.patient_model}, ${judge.judge_model}`,
            }
          }
          headline={T.judge.headline}
          value={judge ? formatNumber(judge.unsupported_per_100) : undefined}
        >
          {judge && (
            <>
              <p>{fill(T.judge.leaks, { value: formatNumber(judge.gated_leaks_per_100) })}</p>
              <p>{fill(T.judge.judged, { n: judge.judged })}</p>
              <p>
                {fill(T.judge.audit, {
                  n: judge.audit_labelled,
                  agreement: formatRate(judge.audit_agreement),
                  missed: judge.audit_missed_unsupported,
                })}
              </p>
            </>
          )}
        </MetricTile>
      </div>

      <Card as="section" className="mt-6 space-y-3" aria-labelledby="targets-title">
        <h2 id="targets-title" className="text-lg font-bold tracking-tight text-ink">
          {T.targetsTitle}
        </h2>
        <ul className="max-w-[68ch] list-disc space-y-2 pl-5 leading-relaxed text-ink marker:text-primary">
          {T.targets.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Card>

      <nav aria-label={T.title} className="mt-6">
        <Link href="/" className={buttonClass({ variant: "secondary" })}>
          {T.backHome}
        </Link>
      </nav>
    </PageShell>
  );
}
