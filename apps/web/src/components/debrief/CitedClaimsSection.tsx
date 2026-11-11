"use client";

import { useState } from "react";
import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";
import type { Debrief } from "@/hooks/useDebriefData";

type Claim = NonNullable<Debrief["items"]>[number];
type Citation = NonNullable<Claim["citations"]>[number];

function sourceLabel(c: Citation): string {
  return (vi.debrief.sourceLabels as Record<string, string>)[c.source_id] ?? c.document_title;
}

function ClaimRow({ claim }: { claim: Claim }) {
  const [open, setOpen] = useState<string | null>(null);
  const citations = claim.citations ?? [];
  const active = citations.find((c) => c.chunk_id === open);
  return (
    <li className="py-3">
      <p className="text-sm text-gray-800">{claim.text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {claim.verified ? (
          citations.map((c) => (
            <button
              key={c.chunk_id}
              type="button"
              aria-expanded={open === c.chunk_id}
              onClick={() => setOpen(open === c.chunk_id ? null : c.chunk_id)}
              className={`rounded-md border px-2 py-0.5 text-xs font-medium ${FOCUS_RING} ${
                open === c.chunk_id
                  ? "border-indigo-700 bg-indigo-700 text-white"
                  : "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
              }`}
            >
              [{sourceLabel(c)}]
            </button>
          ))
        ) : (
          <span className="rounded-md border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
            {vi.debrief.claims.unverified}
          </span>
        )}
      </div>
      {active && (
        <blockquote className="mt-2 rounded-md border-l-4 border-indigo-400 bg-indigo-50/60 px-3 py-2 text-sm text-gray-700">
          <p className="text-xs font-medium text-indigo-900">
            {active.document_title}
            {active.year ? ` (${active.year})` : ""} — {vi.debrief.claims.section}: {active.section}
            {active.review_status === "draft" && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-normal text-amber-900">
                {vi.debrief.claims.draft}
              </span>
            )}
          </p>
          <p className="mt-1 whitespace-pre-line">{active.quote_excerpt}</p>
        </blockquote>
      )}
    </li>
  );
}

export default function CitedClaimsSection({ items }: { items: Claim[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">{vi.debrief.claims.title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm italic text-gray-600">{vi.debrief.claims.empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-gray-100">
          {items.map((c, i) => (
            <ClaimRow key={`${c.criterion_id ?? "x"}-${i}`} claim={c} />
          ))}
        </ul>
      )}
    </section>
  );
}
