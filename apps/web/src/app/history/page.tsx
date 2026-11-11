"use client";

import Link from "next/link";
import { useState } from "react";
import vi from "../../../messages/vi.json";
import ProgressSection from "@/components/history/ProgressSection";
import SessionCard from "@/components/history/SessionCard";
import { useSessionHistory } from "@/hooks/useSessionHistory";

function Skeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="flex items-center gap-2 text-sm text-gray-600" role="status">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" aria-hidden />
        {vi.history.loading}
      </p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}

const PRIMARY = "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700";
const SECONDARY =
  "rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50";

export default function HistoryPage() {
  const h = useSessionHistory();
  const [deletedNotice, setDeletedNotice] = useState(false);

  let body: React.ReactNode;
  if (h.state === "loading") {
    body = <Skeleton />;
  } else if (h.state === "unauthorized") {
    body = (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-800">
        <p className="text-base font-medium text-gray-900">{vi.history.signInPrompt}</p>
        <p className="mt-1 text-gray-600">{vi.history.signInHint}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/login" className={PRIMARY}>
            {vi.history.signIn}
          </Link>
          <Link href="/setup" className={SECONDARY}>
            {vi.history.guestPractice}
          </Link>
        </div>
      </div>
    );
  } else if (h.state === "error") {
    body = (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900">
        <p>{vi.history.loadError}</p>
        <button type="button" onClick={h.reload} className="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-white">
          {vi.history.retry}
        </button>
      </div>
    );
  } else if (h.items.length === 0) {
    body = (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-800">
        <p>{vi.history.empty}</p>
        <Link href="/setup" className={`mt-4 inline-block ${PRIMARY}`}>
          {vi.history.startFirst}
        </Link>
      </div>
    );
  } else {
    body = (
      <div className="space-y-5">
        <ProgressSection progress={h.progress} />
        {h.progressError && <p className="text-xs text-gray-600">{vi.history.progress.loadError}</p>}
        <ul className="space-y-3">
          {h.items.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              onDeleted={() => {
                setDeletedNotice(true);
                void h.remove(s.id);
              }}
            />
          ))}
        </ul>
        {h.loadMoreError && (
          <p role="alert" className="text-sm text-red-800">
            {vi.history.loadMoreError}
          </p>
        )}
        {h.hasMore && (
          <button
            type="button"
            onClick={() => void h.loadMore()}
            disabled={h.loadingMore}
            className={`${SECONDARY} disabled:opacity-60`}
          >
            {h.loadingMore ? vi.history.loadingMore : vi.history.loadMore}
          </button>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">{vi.history.title}</h1>
        <p className="text-sm text-gray-600">{vi.history.subtitle}</p>
      </header>
      <p role="status" aria-live="polite" className={deletedNotice ? "text-sm text-green-800" : "sr-only"}>
        {deletedNotice ? vi.privacy.delete.deleted : ""}
      </p>
      {body}
    </main>
  );
}
