"use client";

import { useState } from "react";
import vi from "../../../messages/vi.json";
import Badge from "@/components/ui/Badge";
import Tile from "@/components/ui/Tile";
import { FOCUS_RING } from "@/components/ui/focus";
import { fmt } from "@/lib/sessionAuth";
import type { Claim } from "./debriefHelpers";

type Citation = NonNullable<Claim["citations"]>[number];

function sourceLabel(c: Citation): string {
  return (vi.debrief.sourceLabels as Record<string, string>)[c.source_id] ?? c.document_title;
}

/** One debrief claim with its source chips; a chip opens the cited excerpt below. */
export function ClaimRow({ claim, className = "" }: { claim: Claim; className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const citations = claim.citations ?? [];
  const active = citations.find((c) => c.chunk_id === open);
  return (
    <li className={`rounded-card border border-line bg-surface p-4 ${className}`}>
      <p className="text-sm leading-relaxed text-ink">{claim.text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {claim.verified ? (
          citations.map((c) => (
            <button
              key={c.chunk_id}
              type="button"
              aria-expanded={open === c.chunk_id}
              onClick={() => setOpen(open === c.chunk_id ? null : c.chunk_id)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors ${FOCUS_RING} ${
                open === c.chunk_id
                  ? "border-primary bg-primary text-white"
                  : "border-primary-soft bg-primary-soft text-primary-strong hover:border-primary"
              }`}
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 2.5h6l2.5 2.5v8.5H4z" />
                <path d="M6.5 8h4M6.5 10.5h4" />
              </svg>
              {sourceLabel(c)}
            </button>
          ))
        ) : (
          <Badge tone="neutral">{vi.debrief.claims.unverified}</Badge>
        )}
      </div>
      {active && (
        <blockquote className="mt-3 rounded-control border-l-4 border-primary bg-canvas px-4 py-3 text-sm text-ink">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{active.document_title}</p>
            {active.review_status === "draft" && <Badge tone="warning">{vi.debrief.claims.draft}</Badge>}
          </div>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-muted">
            {active.year ? <span className="tabular">{fmt(vi.debrief.citationYear, { year: active.year })}</span> : null}
            <span>{fmt(vi.debrief.citationSection, { section: active.section })}</span>
          </p>
          <p className="mt-2 whitespace-pre-line leading-relaxed">{active.quote_excerpt}</p>
        </blockquote>
      )}
    </li>
  );
}

/** Claims not tied to a rubric criterion (the others sit under their criterion). */
export default function CitedClaimsSection({ items }: { items: Claim[] }) {
  return (
    <Tile>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((c, i) => (
          <ClaimRow key={`${c.criterion_id ?? "x"}-${i}`} claim={c} />
        ))}
      </ul>
    </Tile>
  );
}
