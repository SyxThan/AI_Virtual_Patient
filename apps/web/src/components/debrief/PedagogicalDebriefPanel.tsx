import vi from "../../../messages/vi.json";
import Tile from "@/components/ui/Tile";
import type { Debrief } from "@/hooks/useDebriefData";

type Summary = NonNullable<Debrief["summary"]>;

/** One part of the debrief. `tone` gives each part a calm tint so the parts read apart. */
function Part({
  title,
  tone = "plain",
  className = "",
  children,
}: {
  title: string;
  tone?: "plain" | "mint" | "sky" | "warning";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    plain: "border border-line bg-surface",
    mint: "bg-mint-soft",
    sky: "bg-info-soft",
    warning: "bg-warning-soft",
  } as const;
  const titleTone = {
    plain: "text-ink",
    mint: "text-mint-ink",
    sky: "text-info",
    warning: "text-warning",
  } as const;
  return (
    <div className={`rounded-card p-4 sm:p-5 ${tones[tone]} ${className}`}>
      <h3 className={`font-bold ${titleTone[tone]}`}>{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-ink">{children}</div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="italic text-ink-muted">{vi.debrief.summary.none}</p>;
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-muted">
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

export default function PedagogicalDebriefPanel({ summary }: { summary: Summary }) {
  const t = vi.debrief.summary;
  return (
    <Tile as="section" tone="surface" aria-labelledby="summary-title" className="border border-line">
      <h2 id="summary-title" className="text-xl font-bold tracking-tight">
        {t.title}
      </h2>
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Part title={t.expected_approach} className="md:col-span-2">
          <p className="max-w-prose">{summary.expected_approach}</p>
        </Part>
        <Part title={t.rationale} className="md:col-span-2">
          <p className="max-w-prose">{summary.rationale}</p>
        </Part>
        <Part title={t.learning_points} tone="mint">
          <List items={summary.learning_points ?? []} />
        </Part>
        <Part title={t.acceptable_alternatives} tone="sky">
          <p>{summary.acceptable_alternatives}</p>
        </Part>
        <Part title={t.important_errors} tone="warning" className="md:col-span-2">
          <List items={summary.important_errors ?? []} />
        </Part>
      </div>
    </Tile>
  );
}
