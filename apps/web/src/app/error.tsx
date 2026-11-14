"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import vi from "../../messages/vi.json";
import { buttonClass } from "@/components/ui/Button";
import PageShell from "@/components/ui/PageShell";
import Tile, { TILE_MUTED } from "@/components/ui/Tile";
import { fmt } from "@/lib/sessionAuth";

/**
 * Route error boundary. Shows a Vietnamese message and a retry via `reset()`;
 * never the error message or stack (they can carry internals). Only Next's
 * opaque `digest` is shown, so a report can be matched to the server log.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <PageShell>
      <div className="grid gap-4 sm:grid-cols-5">
        <Tile tone="sand" role="alert" className="flex flex-col justify-between gap-10 sm:col-span-3">
          <p className={`text-sm font-semibold ${TILE_MUTED.sand}`}>{vi.errors.errorCode}</p>
          <div className="space-y-3">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-extrabold tracking-tight text-ink outline-none sm:text-4xl"
            >
              {vi.errors.errorTitle}
            </h1>
            <p className="text-ink">{vi.errors.errorBody}</p>
          </div>
        </Tile>
        <Tile tone="surface" className="flex flex-col justify-between gap-6 border border-line sm:col-span-2">
          {error.digest ? (
            <p className="text-sm break-all text-ink-muted">{fmt(vi.errors.errorRef, { digest: error.digest })}</p>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="flex flex-col gap-3">
            <button type="button" onClick={reset} className={buttonClass({ variant: "primary", className: "w-full" })}>
              {vi.errors.retry}
            </button>
            <Link href="/" className={buttonClass({ variant: "secondary", className: "w-full" })}>
              {vi.errors.home}
            </Link>
          </div>
        </Tile>
      </div>
    </PageShell>
  );
}
