import type { ReactNode } from "react";
import vi from "../../../messages/vi.json";

/** Step number with a check drawn beside it once the step is complete. */
export function StepHeading({ n, done, children }: { n: number; done: boolean; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors duration-150 ${
          done ? "bg-primary text-white" : "bg-canvas text-ink ring-1 ring-line-strong"
        }`}
      >
        {n}
      </span>
      <span className="font-display text-base font-bold tracking-tight text-ink">{children}</span>
      {done && (
        <>
          <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-success" fill="none" aria-hidden="true">
            <path
              className="setup-check"
              d="M4.5 10.5l3.5 3.5 7.5-8"
              pathLength={1}
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="sr-only">({vi.setupUx.stepDone})</span>
        </>
      )}
    </span>
  );
}

/**
 * One choice of a radio group: the whole row is the label (>= 48px tall), a
 * native radio (visually hidden, keeps arrow-key and form semantics) and a
 * 20px ring. Selected = 2px primary border + soft fill, transitioned in 150ms.
 */
export function ChoiceRow({
  name,
  value,
  checked,
  onSelect,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border-2 px-3.5 py-1.5 text-ink short:gap-2 short:px-2.5 transition-[border-color,background-color] duration-150 ease-out has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 ${
        checked ? "border-primary bg-primary-soft" : "border-line-strong/70 bg-surface hover:border-ink-muted"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-150 ${
          checked ? "border-primary" : "border-ink-muted"
        }`}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full bg-primary transition-transform duration-150 ${checked ? "scale-100" : "scale-0"}`}
        />
      </span>
      <span className="min-w-0 font-semibold leading-snug short:text-sm">{children}</span>
    </label>
  );
}
