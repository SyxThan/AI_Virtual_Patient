import type { Metadata } from "next";
import Link from "next/link";
import vi from "../../../messages/vi.json";
import MetricTile from "@/components/transparency/MetricTile";
import Badge from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import PageShell, { PAGE_TITLE } from "@/components/ui/PageShell";
import { evalsSummary, fill, formatMs, formatNumber, formatRate } from "@/lib/evalsSummary";

// Every number here comes from src/data/evals-summary.json, written by
// evals/publish_summary.py from real (non-fake) results in evals/results/
// (Hard rule 3, AVP-139). Nothing on this page is typed in by hand.
export const metadata: Metadata = { title: vi.transparency.title };

const T = vi.transparency;

export default function TransparencyPage() {
  const { latency, repeatability: rep, redteam: rt, judge } = evalsSummary;
  const lat = latency.voice ?? latency.text;

  return (
    <PageShell width="default">
      <header className="mb-8 space-y-3">
        <Badge tone="info">{T.badge}</Badge>
        <h1 className={PAGE_TITLE}>{T.title}</h1>
        <p className="max-w-[68ch] text-ink-muted">{T.intro}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricTile
          tone="mint"
          title={T.latency.title}
          note={T.latency.note}
          measured={!!lat}
          measuredAt={lat?.measured_at}
          headline={T.latency.headline}
          value={lat ? formatMs(lat.first_audio_p50) : undefined}
        >
          {lat && (
            <>
              <p>{fill(T.latency.p95, { value: formatMs(lat.first_audio_p95) })}</p>
              {lat.target_met !== null && (
                <p className="font-semibold">
                  {fill(T.latency.target, {
                    value: formatMs(lat.target_ms),
                    status: lat.target_met ? T.latency.met : T.latency.notMet,
                  })}
                </p>
              )}
              <p>{fill(T.latency.turns, { n: lat.turns, errors: lat.turns_with_errors })}</p>
            </>
          )}
        </MetricTile>

        <MetricTile
          tone="sky"
          title={T.repeatability.title}
          note={T.repeatability.note}
          measured={!!rep}
          measuredAt={rep?.measured_at}
          headline={T.repeatability.headline}
          value={rep ? formatRate(rep.identical_all_runs_rate) : undefined}
        >
          {rep && (
            <>
              <p>{fill(T.repeatability.range, { value: formatNumber(rep.max_total_score_range) })}</p>
              <p>
                {fill(T.repeatability.runs, { transcripts: rep.transcripts, runs: rep.runs_per_transcript })}
              </p>
            </>
          )}
        </MetricTile>

        <MetricTile
          tone="sand"
          title={T.redteam.title}
          note={T.redteam.note}
          measured={!!rt}
          measuredAt={rt?.measured_at}
          headline={T.redteam.headline}
          value={rt ? formatRate(rt.pass_rate) : undefined}
        >
          {rt && (
            <>
              <p className="font-semibold">
                {fill(T.redteam.total, { passed: rt.passed, n: rt.completed, cases: rt.cases.length })}
              </p>
              {rt.errors > 0 && <p>{fill(T.redteam.errors, { n: rt.errors, total: rt.prompts })}</p>}
              <ul className="space-y-0.5">
                {rt.cases.map((c) => (
                  <li key={c.case_id} className="flex justify-between gap-2">
                    <span className="min-w-0">{c.title}</span>
                    <span className="tabular shrink-0 whitespace-nowrap font-semibold">
                      {fill(T.redteam.count, { passed: c.passed, n: c.completed })}
                      {c.errors > 0 && (
                        <span className="font-normal"> {fill(T.redteam.caseErrors, { n: c.errors })}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </MetricTile>

        <MetricTile
          title={T.judge.title}
          note={T.judge.note}
          measured={!!judge}
          measuredAt={judge?.measured_at}
          headline={T.judge.headline}
          value={judge ? formatNumber(judge.unsupported_per_100) : undefined}
        >
          {judge && (
            <>
              <p>{fill(T.judge.leaks, { value: formatNumber(judge.gated_leaks_per_100) })}</p>
              <p>{fill(T.judge.audit, { n: judge.audit_labelled, agreement: formatRate(judge.audit_agreement) })}</p>
            </>
          )}
        </MetricTile>
      </div>

      <p className="mt-6 text-sm text-ink-muted">{T.practiceOnly}</p>

      <nav aria-label={T.title} className="mt-6">
        <Link href="/" className={buttonClass({ variant: "secondary" })}>
          {T.backHome}
        </Link>
      </nav>
    </PageShell>
  );
}
