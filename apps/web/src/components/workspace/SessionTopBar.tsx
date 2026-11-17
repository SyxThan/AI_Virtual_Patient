"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import vi from "../../../messages/vi.json";
import { useCaseVoice } from "@/components/workspace/caseVoice";
import BrandMark from "@/components/shell/BrandMark";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { FOCUS_RING } from "@/components/ui/focus";

/**
 * One 56 px row: home mark, case title and mode (left), clock and help
 * (right), then a divider and at least 24 px of space before "Kết thúc buổi
 * khám", which opens a confirmation and is never next to "Hướng dẫn".
 */
export default function SessionTopBar({
  exam,
  timer,
  onHelp,
  onFinish,
}: {
  exam: boolean;
  timer: ReactNode;
  onHelp: () => void;
  onFinish: () => void;
}) {
  const voice = useCaseVoice();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 rounded-full bg-surface pl-2 pr-2 shadow-lift ring-1 ring-line/70 sm:gap-4 sm:pl-3">
      <Link
        href="/"
        aria-label={vi.cockpit.home}
        title={vi.cockpit.home}
        className={`hidden h-11 w-11 shrink-0 place-items-center rounded-full sm:grid ${FOCUS_RING}`}
      >
        <BrandMark className="h-8 w-8" />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <h1 className="max-sm:sr-only truncate font-display text-base font-bold tracking-tight text-ink sm:text-lg">
          {voice.title}
        </h1>
        <Badge tone={exam ? "info" : "primary"} className="shrink-0">
          <span className="sr-only">{vi.session.modeLabel}: </span>
          {exam ? vi.session.mode.exam : vi.session.mode.guided}
        </Badge>
      </div>
      <div className="shrink-0">{timer}</div>
      <Button variant="ghost" onClick={onHelp} className="shrink-0 max-sm:w-11 max-sm:px-0">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M10 14v.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className="max-sm:sr-only">{vi.workspace.help}</span>
      </Button>
      {/* The way out stands apart: divider + >= 24 px. */}
      <span aria-hidden="true" className="mx-2 h-7 w-px shrink-0 bg-line-strong sm:mx-1.5" />
      <Button variant="secondary" pill onClick={onFinish} className="shrink-0 max-sm:px-4 border-danger/40 text-danger hover:border-danger hover:bg-danger-soft">
        <span className="max-sm:hidden">{vi.session.finish}</span>
        <span className="sm:hidden">{vi.cockpit.finishShort}</span>
      </Button>
    </header>
  );
}
