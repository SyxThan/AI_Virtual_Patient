"use client";

import { useId } from "react";
import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";
import { PATIENT_GROUPS, type CaseFilters as Filters, type PatientGroup } from "./libraryHelpers";

const f = vi.cases.filters;

// Literal class strings only (Tailwind v4 scans source text).
const CHIP_BASE = `inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold ${FOCUS_RING}`;
const CHIP_ON = "border-primary bg-primary text-white";
const CHIP_OFF = "border-line-strong bg-surface text-ink hover:border-ink/40 hover:bg-canvas";

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`${CHIP_BASE} ${pressed ? CHIP_ON : CHIP_OFF}`}>
      {children}
    </button>
  );
}

/**
 * Filter bar for /cases: patient-group chips (aria-pressed), specialty select and,
 * signed in only, "Chỉ ca chưa luyện". Plus the practice-only reveal switch.
 */
export default function CaseFilters({
  filters,
  specialties,
  signedIn,
  onChange,
  reveal,
  onRevealChange,
}: {
  filters: Filters;
  specialties: string[];
  signedIn: boolean;
  onChange: (next: Filters) => void;
  reveal: boolean;
  onRevealChange: (on: boolean) => void;
}) {
  const specialtyId = useId();
  const unpractisedId = useId();
  const revealId = useId();
  const revealHintId = useId();
  const groupLabelId = useId();
  const setGroup = (group: PatientGroup | null) => onChange({ ...filters, group });

  // A specialty from a shared link that no case has is still listed, so the select shows the truth.
  const options =
    filters.specialty && !specialties.includes(filters.specialty) ? [...specialties, filters.specialty] : specialties;

  return (
    <section aria-label={f.label} className="mb-6 flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div role="group" aria-labelledby={groupLabelId} className="flex min-w-0 flex-col gap-2">
          <span id={groupLabelId} className="text-sm font-semibold text-ink-muted">
            {f.groupLabel}
          </span>
          <div className="flex flex-wrap gap-2">
            <Chip pressed={filters.group === null} onClick={() => setGroup(null)}>
              {f.all}
            </Chip>
            {PATIENT_GROUPS.map((g) => (
              <Chip key={g} pressed={filters.group === g} onClick={() => setGroup(g)}>
                {f.group[g]}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={specialtyId} className="text-sm font-semibold text-ink-muted">
            {f.specialty}
          </label>
          <select
            id={specialtyId}
            value={filters.specialty ?? ""}
            onChange={(e) => onChange({ ...filters, specialty: e.target.value || null })}
            className={`h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink lg:w-64 ${FOCUS_RING}`}
          >
            <option value="">{f.specialtyAll}</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-8">
        {signedIn && (
          <label htmlFor={unpractisedId} className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink">
            <input
              id={unpractisedId}
              type="checkbox"
              checked={filters.unpractised}
              onChange={(e) => onChange({ ...filters, unpractised: e.target.checked })}
              className={`h-5 w-5 rounded accent-primary ${FOCUS_RING}`}
            />
            {f.unpractised}
          </label>
        )}
        <div className="flex min-w-0 flex-col">
          <label htmlFor={revealId} className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink">
            <input
              id={revealId}
              type="checkbox"
              role="switch"
              checked={reveal}
              aria-describedby={revealHintId}
              onChange={(e) => onRevealChange(e.target.checked)}
              className={`h-5 w-5 rounded accent-primary ${FOCUS_RING}`}
            />
            {vi.cases.reveal.label}
          </label>
          <p id={revealHintId} className="max-w-prose text-sm text-ink-muted">
            {vi.cases.reveal.hint}
          </p>
        </div>
      </div>
    </section>
  );
}
