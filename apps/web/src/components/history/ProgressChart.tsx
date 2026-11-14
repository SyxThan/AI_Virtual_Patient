import vi from "../../../messages/vi.json";
import type { ProgressAttempt } from "@/hooks/useSessionHistory";
import { fmt } from "@/lib/sessionAuth";
import { formatScore, formatShortDate } from "./format";

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 32, left: 40 };
const GRID = [0, 25, 50, 75, 100];

/**
 * Total score per evaluated attempt (oldest to newest). One series, one hue;
 * a hollow marker flags an attempt with a missed red flag (shape, not colour
 * alone). Only stored scores are drawn: no trend line, no extrapolation.
 */
export default function ProgressChart({ attempts }: { attempts: ProgressAttempt[] }) {
  const points = attempts.filter((a) => a.total_score != null);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1));
  const y = (score: number) => PAD.top + plotH - (score / 100) * plotH;
  const scores = points.map((p) => p.total_score as number);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.total_score as number)}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const desc = fmt(vi.history.progress.chartDesc, {
    count: points.length,
    min: formatScore(Math.min(...scores)),
    max: formatScore(Math.max(...scores)),
  });

  return (
    <figure className="space-y-3">
      <figcaption className="text-sm font-semibold text-ink">{vi.history.progress.chartTitle}</figcaption>
      {/* On phones the chart keeps a legible minimum width and scrolls inside its tile. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[30rem]"
          role="img"
          aria-labelledby="progress-chart-title progress-chart-desc"
        >
          <title id="progress-chart-title">{vi.history.progress.chartTitle}</title>
          <desc id="progress-chart-desc">{desc}</desc>
          {GRID.map((g) => (
            <g key={g}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill="var(--color-ink-muted)" className="tabular">
                {g}
              </text>
            </g>
          ))}
          <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth={2.5} strokeLinejoin="round" />
          {points.map((p, i) => {
            const score = p.total_score as number;
            const label = fmt(vi.history.progress.pointTitle, {
              n: i + 1,
              date: formatShortDate(p.started_at),
              score: formatScore(score),
            });
            return (
              <g key={p.session_id}>
                {/* Larger transparent hit target carries the native hover tooltip. */}
                <circle cx={x(i)} cy={y(score)} r={12} fill="transparent">
                  <title>{label}</title>
                </circle>
                <circle
                  cx={x(i)}
                  cy={y(score)}
                  r={5}
                  fill={p.critical_missed ? "var(--color-surface)" : "var(--color-primary)"}
                  stroke={p.critical_missed ? "var(--color-danger)" : "var(--color-surface)"}
                  strokeWidth={2}
                  pointerEvents="none"
                />
                {(i % labelEvery === 0 || i === points.length - 1) && (
                  <text x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--color-ink-muted)">
                    {fmt(vi.history.progress.attempt, { n: i + 1 })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {points.some((p) => p.critical_missed) && (
        <p className="text-sm text-ink-muted">{vi.history.progress.redFlagMark}</p>
      )}
      {/* sr-only on a wrapper: a <table> ignores the 1px width and can widen the page. */}
      <div className="sr-only">
        <table>
          <caption>{vi.history.progress.chartTitle}</caption>
          <thead>
            <tr>
              <th scope="col">{vi.history.progress.colAttempt}</th>
              <th scope="col">{vi.history.progress.colDate}</th>
              <th scope="col">{vi.history.progress.colScore}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={p.session_id}>
                <td>{i + 1}</td>
                <td>{formatShortDate(p.started_at)}</td>
                <td>
                  {formatScore(p.total_score as number)}
                  {p.critical_missed ? ` (${vi.history.redFlag})` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
