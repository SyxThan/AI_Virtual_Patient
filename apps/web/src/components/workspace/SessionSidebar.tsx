"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";

export type SidebarTab = "chat" | "record";
const TABS: SidebarTab[] = ["chat", "record"];

/**
 * Right column of the workspace: two tabs with counts ("Trò chuyện",
 * "Phiếu khám 1/4"), the active panel (scrolls on its own), the question input
 * pinned below it and, in guided mode, the reminder drawer at the very bottom.
 * `[container-type:size]` lets the drawer cap itself at half the column.
 */
export default function SessionSidebar({
  tab,
  onTab,
  chatCount,
  examDone,
  examTotal,
  chat,
  record,
  composer,
  drawer,
  headerAction,
}: {
  tab: SidebarTab;
  onTab: (tab: SidebarTab) => void;
  chatCount: number;
  examDone: number;
  examTotal: number;
  chat: ReactNode;
  record: ReactNode;
  composer: ReactNode;
  drawer?: ReactNode;
  /** e.g. the collapse button (desktop). */
  headerAction?: ReactNode;
}) {
  const base = useId();
  const tabRefs = useRef<Record<SidebarTab, HTMLButtonElement | null>>({ chat: null, record: null });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = TABS.indexOf(tab);
    const next =
      e.key === "Home" ? TABS[0] : e.key === "End" ? TABS[TABS.length - 1] : TABS[(i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length];
    onTab(next);
    tabRefs.current[next]?.focus();
  };

  const counts: Record<SidebarTab, string> = { chat: String(chatCount), record: `${examDone}/${examTotal}` };

  return (
    <section
      aria-label={vi.workspace.regions.chat}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-surface [container-type:size]"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-2">
        <div role="tablist" aria-label={vi.cockpit.tabs.label} onKeyDown={onKeyDown} className="flex min-w-0 flex-1 gap-1">
          {TABS.map((t) => {
            const active = t === tab;
            return (
              <button
                key={t}
                ref={(el) => {
                  tabRefs.current[t] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${t}`}
                aria-selected={active}
                aria-controls={`${base}-panel-${t}`}
                tabIndex={active ? 0 : -1}
                onClick={() => onTab(t)}
                className={`relative flex min-h-12 items-center gap-2 px-3 text-sm font-semibold ${FOCUS_RING} focus-visible:ring-inset focus-visible:ring-offset-0 ${
                  active ? "text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {vi.cockpit.tabs[t]}
                <span
                  className={`tabular rounded-full px-2 py-0.5 text-xs ${active ? "bg-primary text-white" : "bg-canvas text-ink-muted"}`}
                >
                  {counts[t]}
                </span>
                {active && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
        {headerAction}
      </div>

      {TABS.map((t) => (
        <div
          key={t}
          role="tabpanel"
          id={`${base}-panel-${t}`}
          aria-labelledby={`${base}-tab-${t}`}
          hidden={t !== tab}
          className="min-h-0 flex-1 flex-col data-[shown=true]:flex max-md:group-data-[snap=peek]/sheet:hidden!"
          data-shown={t === tab}
        >
          {t === "chat" ? chat : record}
        </div>
      ))}

      <div className="shrink-0 border-t border-line">{composer}</div>
      {drawer}
    </section>
  );
}
