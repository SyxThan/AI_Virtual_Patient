import vi from "../../../messages/vi.json";
import Tile from "@/components/ui/Tile";
import type { Debrief } from "@/hooks/useDebriefData";

type Summary = NonNullable<Debrief["summary"]>;

/** One part of the debrief. `tone` gives each part a calm tint so the parts read apart. */
function Part({
  title,
  tone = "plain",
  children,
}: {
  title: string;
  tone?: "plain" | "mint" | "sky" | "warning";
  children: React.ReactNode;
}) {
  const tones = {
    plain: "",
    mint: "rounded-card bg-mint-soft p-4 sm:p-5",
    sky: "rounded-card bg-info-soft p-4 sm:p-5",
    warning: "rounded-card bg-warning-soft p-4 sm:p-5",
  } as const;
  const titleTone = {
    plain: "text-ink",
    mint: "text-mint-ink",
    sky: "text-info",
    warning: "text-warning",
  } as const;
  return (
    <div className={tones[tone]}>
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

/**
 * Reads in teaching order: the standard approach and why (left, prose), then what to
 * avoid, what to remember and acceptable alternatives (right, tinted). One column on phones.
 */
export default function PedagogicalDebriefPanel({ summary }: { summary: Summary }) {
  const t = vi.debrief.summary;
  return (
    <Tile className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
      <div className="space-y-6 lg:col-span-7">
        <Part title={t.expected_approach}>
          <p className="max-w-prose">{summary.expected_approach}</p>
        </Part>
        <div className="border-t border-line pt-6">
          <Part title={t.rationale}>
            <p className="max-w-prose">{summary.rationale}</p>
          </Part>
        </div>
      </div>
      <div className="space-y-3 lg:col-span-5">
        <Part title={t.important_errors} tone="warning">
          <List items={summary.important_errors ?? []} />
        </Part>
        <Part title={t.learning_points} tone="mint">
          <List items={summary.learning_points ?? []} />
        </Part>
        <Part title={t.acceptable_alternatives} tone="sky">
          <p>{summary.acceptable_alternatives}</p>
        </Part>
      </div>
    </Tile>
  );
}
