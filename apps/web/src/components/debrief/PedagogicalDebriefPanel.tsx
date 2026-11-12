import vi from "../../../messages/vi.json";
import type { Debrief } from "@/hooks/useDebriefData";

type Summary = NonNullable<Debrief["summary"]>;

function Tier({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <div className="mt-1 text-sm text-gray-700">{children}</div>
      </div>
    </div>
  );
}

function List({ items, danger = false }: { items: string[]; danger?: boolean }) {
  if (items.length === 0) return <p className="italic text-gray-600">{vi.debrief.summary.none}</p>;
  return (
    <ul className={`list-disc space-y-1 pl-5 ${danger ? "text-red-800" : ""}`}>
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

export default function PedagogicalDebriefPanel({ summary }: { summary: Summary }) {
  const t = vi.debrief.summary;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">{t.title}</h2>
      <div className="mt-4 space-y-5">
        <Tier n={1} title={t.expected_approach}>
          <p>{summary.expected_approach}</p>
        </Tier>
        <Tier n={2} title={t.rationale}>
          <p>{summary.rationale}</p>
        </Tier>
        <Tier n={3} title={t.learning_points}>
          <List items={summary.learning_points ?? []} />
        </Tier>
        <Tier n={4} title={t.acceptable_alternatives}>
          <p>{summary.acceptable_alternatives}</p>
        </Tier>
        <Tier n={5} title={t.important_errors}>
          <List items={summary.important_errors ?? []} danger />
        </Tier>
      </div>
    </section>
  );
}
