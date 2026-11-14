"use client";

import Link from "next/link";
import { useState } from "react";
import vi from "../../../messages/vi.json";
import ProgressSection from "@/components/history/ProgressSection";
import SessionCard from "@/components/history/SessionCard";
import { buttonClass } from "@/components/ui/Button";
import Tile, { TILE_MUTED } from "@/components/ui/Tile";
import PageShell from "@/components/ui/PageShell";
import { useSessionHistory } from "@/hooks/useSessionHistory";

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <p className="flex items-center gap-3 text-sm text-ink-muted" role="status">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary motion-reduce:animate-none"
          aria-hidden="true"
        />
        {vi.history.loading}
      </p>
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="h-48 animate-pulse rounded-tile bg-surface motion-reduce:animate-none lg:col-span-3" />
        <div className="h-48 animate-pulse rounded-tile bg-surface motion-reduce:animate-none" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-card bg-surface motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export default function HistoryPage() {
  const h = useSessionHistory();
  const [deletedNotice, setDeletedNotice] = useState(false);
  const hasItems = h.state === "ready" && h.items.length > 0;

  let body: React.ReactNode;
  if (h.state === "loading") {
    body = <Skeleton />;
  } else if (h.state === "unauthorized") {
    body = (
      <Tile tone="sky" className="max-w-2xl">
        <p className="text-xl font-bold tracking-tight">{vi.history.signInPrompt}</p>
        <p className={`mt-2 ${TILE_MUTED.sky}`}>{vi.history.signInHint}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/login" className={buttonClass({ variant: "primary" })}>
            {vi.history.signIn}
          </Link>
          <Link href="/setup" className={buttonClass({ variant: "secondary" })}>
            {vi.history.guestPractice}
          </Link>
        </div>
      </Tile>
    );
  } else if (h.state === "error") {
    body = (
      <div
        role="alert"
        className="flex max-w-2xl flex-col gap-4 rounded-card border border-warning/30 bg-warning-soft p-5 text-warning sm:flex-row sm:items-center sm:justify-between"
      >
        <p>{vi.history.loadError}</p>
        <button type="button" onClick={h.reload} className={buttonClass({ variant: "secondary" })}>
          {vi.history.retry}
        </button>
      </div>
    );
  } else if (h.items.length === 0) {
    body = (
      <Tile tone="mint" className="max-w-2xl">
        <p className="text-xl font-bold tracking-tight">{vi.history.emptyTitle}</p>
        <p className={`mt-2 ${TILE_MUTED.mint}`}>{vi.history.emptyBody}</p>
        <Link href="/setup" className={buttonClass({ variant: "primary", size: "lg", className: "mt-6" })}>
          {vi.history.startFirst}
        </Link>
      </Tile>
    );
  } else {
    body = (
      <div className="space-y-8">
        <ProgressSection progress={h.progress} />
        {h.progressError && <p className="text-sm text-ink-muted">{vi.history.progress.loadError}</p>}
        <section aria-labelledby="history-list-title" className="space-y-4">
          <h2 id="history-list-title" className="text-xl font-bold tracking-tight text-ink">
            {vi.history.listTitle}
          </h2>
          <ul className="grid gap-4 lg:grid-cols-2">
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
            <p role="alert" className="text-sm text-warning">
              {vi.history.loadMoreError}
            </p>
          )}
          {h.hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => void h.loadMore()}
                disabled={h.loadingMore}
                className={buttonClass({ variant: "secondary", className: "w-full sm:w-auto" })}
              >
                {h.loadingMore ? vi.history.loadingMore : vi.history.loadMore}
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <PageShell
      title={vi.history.title}
      description={vi.history.subtitle}
      actions={
        hasItems ? (
          <Link href="/setup" className={buttonClass({ variant: "primary" })}>
            {vi.history.newSession}
          </Link>
        ) : undefined
      }
    >
      <p
        role="status"
        aria-live="polite"
        className={deletedNotice ? "mb-4 text-sm font-medium text-success" : "sr-only"}
      >
        {deletedNotice ? vi.privacy.delete.deleted : ""}
      </p>
      {body}
    </PageShell>
  );
}
