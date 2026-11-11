"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import vi from "../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";
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
    <main className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16 sm:px-6">
      <div role="alert" className="flex flex-col gap-2">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-gray-900 outline-none">
          {vi.errors.errorTitle}
        </h1>
        <p className="text-gray-700">{vi.errors.errorBody}</p>
      </div>
      {error.digest && (
        <p className="text-xs text-gray-600">{fmt(vi.errors.errorRef, { digest: error.digest })}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className={`rounded-md bg-gray-900 px-4 py-2 font-medium text-white hover:bg-gray-700 ${FOCUS_RING}`}
        >
          {vi.errors.retry}
        </button>
        <Link
          href="/"
          className={`rounded-md border border-gray-400 px-4 py-2 font-medium text-gray-900 hover:bg-gray-50 ${FOCUS_RING}`}
        >
          {vi.errors.home}
        </Link>
      </div>
    </main>
  );
}
