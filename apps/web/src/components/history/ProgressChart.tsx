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
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium text-gray-800">{vi.history.progress.chartTitle}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-labelledby="progress-chart-title progress-chart-desc"
      >
        <title id="progress-chart-title">{vi.history.progress.chartTitle}</title>
        <desc id="progress-chart-desc">{desc}</desc>
        {GRID.map((g) => (
          <g key={g}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill="#6b7280">
              {g}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#4f46e5" strokeWidth={2} strokeLinejoin="round" />
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
                fill={p.critical_missed ? "#ffffff" : "#4f46e5"}
                stroke={p.critical_missed ? "#b91c1c" : "#ffffff"}
                strokeWidth={2}
                pointerEvents="none"
              />
              {(i % labelEvery === 0 || i === points.length - 1) && (
                <text x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="#6b7280">
                  {fmt(vi.history.progress.attempt, { n: i + 1 })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {points.some((p) => p.critical_missed) && (
        <p className="text-xs text-gray-600">{vi.history.progress.redFlagMark}</p>
      )}
      <table className="sr-only">
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
    </figure>
  );
}
