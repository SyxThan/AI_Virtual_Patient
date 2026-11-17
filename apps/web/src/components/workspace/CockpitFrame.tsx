"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";

const WIDTH_KEY = "avp_cockpit_side_w_v1";
const COLLAPSED_KEY = "avp_cockpit_side_collapsed_v1";
const MIN_SIDE = 320;
const MAX_SIDE = 640;
/** The stage keeps at least 60% of the row. */
const MAX_SIDE_SHARE = 0.4;

type Snap = "peek" | "half" | "full";
const SNAPS: Snap[] = ["peek", "half", "full"];
const SHEET_PEEK = "11.5rem";
const SHEET_HEIGHT: Record<Snap, string> = { peek: SHEET_PEEK, half: "58dvh", full: "calc(100dvh - 4.5rem)" };

function readNumber(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* layout preferences are a convenience only */
  }
}

/**
 * The workspace app frame: exactly one viewport tall (100dvh), no page scroll;
 * only the panels inside scroll.
 *
 * - >= 1280 px: stage + right column; the column defaults to
 *   clamp(360px, 30vw, 460px), can be dragged (or moved with the arrow keys on
 *   the divider) between 320 px and 40% of the row, and collapsed to a rail.
 *   Width and collapse are remembered in this browser.
 * - 1024–1279 px: the column is fixed at 340 px (still collapsible).
 * - 768–1023 px: stage on top (55dvh), the column below it.
 * - < 768 px: stage 45dvh; the column is a bottom sheet with three heights.
 */
export default function CockpitFrame({
  topBar,
  banner,
  stage,
  renderSidebar,
}: {
  topBar: ReactNode;
  banner?: ReactNode;
  stage: ReactNode;
  /** The column; receives the collapse button for its header. */
  renderSidebar: (collapseButton: ReactNode) => ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [snap, setSnap] = useState<Snap>("peek");
  const [sideW, setSideW] = useState<number | null>(null);

  // Restore the remembered layout after mount (no hydration mismatch).
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setSideW(readNumber(WIDTH_KEY));
      try {
        setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
      } catch {
        /* default: expanded */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clampWidth = useCallback((w: number) => {
    const row = rowRef.current?.clientWidth ?? 1600;
    return Math.round(Math.min(Math.max(w, MIN_SIDE), Math.min(MAX_SIDE, row * MAX_SIDE_SHARE)));
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      write(COLLAPSED_KEY, c ? "0" : "1");
      return !c;
    });
  }, []);

  // ---- divider: pointer drag writes the CSS variable directly (no re-render per move)
  const drag = useRef<{ right: number; width: number } | null>(null);
  const onDividerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const row = rowRef.current;
    if (!row || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { right: row.getBoundingClientRect().right, width: sideW ?? 0 };
    document.body.style.cursor = "col-resize";
  };
  const onDividerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const row = rowRef.current;
    if (!d || !row) return;
    d.width = clampWidth(d.right - e.clientX - 8);
    row.style.setProperty("--side-w", `${d.width}px`);
  };
  const onDividerUp = () => {
    const d = drag.current;
    drag.current = null;
    document.body.style.cursor = "";
    if (!d || !d.width) return;
    setSideW(d.width);
    write(WIDTH_KEY, String(d.width));
  };
  const onDividerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const current = sideW ?? rowRef.current?.querySelector<HTMLElement>("[data-side]")?.offsetWidth ?? 400;
    const next = clampWidth(current + (e.key === "ArrowLeft" ? 24 : -24));
    setSideW(next);
    write(WIDTH_KEY, String(next));
  };

  // ---- mobile sheet
  const sheetDrag = useRef<number | null>(null);
  const step = (dir: 1 | -1) =>
    setSnap((s) => SNAPS[Math.min(SNAPS.length - 1, Math.max(0, SNAPS.indexOf(s) + dir))]);

  const rowStyle = { "--side-w": sideW ? `${sideW}px` : "clamp(360px, 30vw, 460px)" } as CSSProperties;
  const mainStyle = { "--sheet-peek": SHEET_PEEK, "--sheet-h": SHEET_HEIGHT[snap] } as CSSProperties;

  const collapseButton = (
    <button
      type="button"
      onClick={toggleCollapsed}
      aria-label={vi.cockpit.sidebar.collapse}
      title={vi.cockpit.sidebar.collapse}
      className={`hidden h-11 w-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-canvas hover:text-ink lg:grid ${FOCUS_RING}`}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
        <path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  return (
    <main id="main" style={mainStyle} className="flex h-dvh flex-col gap-3 overflow-hidden p-4 md:gap-4">
      {topBar}
      {banner}
      <div ref={rowRef} style={rowStyle} className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Stage: 45dvh canvas on phones (inside ClinicStage), 55dvh on tablets, the rest of the row on desktop. */}
        <div className="min-h-0 min-w-0 shrink-0 md:h-[55dvh] lg:h-auto lg:flex-1 lg:shrink">{stage}</div>

        {/* Divider (>= 1280 px, column expanded); the negative margins lay it over the row gap. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={vi.cockpit.sidebar.resize}
          aria-valuenow={sideW ?? undefined}
          aria-valuemin={MIN_SIDE}
          aria-valuemax={MAX_SIDE}
          tabIndex={collapsed ? -1 : 0}
          onPointerDown={onDividerDown}
          onPointerMove={onDividerMove}
          onPointerUp={onDividerUp}
          onPointerCancel={onDividerUp}
          onKeyDown={onDividerKey}
          className={`group hidden w-4 shrink-0 cursor-col-resize xl:-mx-4 touch-none items-center justify-center ${collapsed ? "" : "xl:flex"} ${FOCUS_RING} rounded-full`}
        >
          <span className="h-14 w-1 rounded-full bg-line-strong transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
        </div>

        <aside
          data-side=""
          data-snap={snap}
          className={`group/sheet flex min-h-0 flex-col overflow-hidden rounded-tile bg-surface shadow-lift ring-1 ring-line/70 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:h-[var(--sheet-h)] max-md:rounded-b-none max-md:transition-[height] max-md:duration-[var(--dur-base)] max-md:ease-[var(--ease-out)] motion-reduce:transition-none md:flex-1 lg:flex-none ${
            collapsed ? "lg:w-14" : "lg:w-[340px] xl:w-[var(--side-w)]"
          }`}
        >
          {/* Sheet handle (< 768 px): tap steps up (and back to the start from the top); drag up/down snaps. */}
          <button
            type="button"
            aria-label={vi.cockpit.sidebar.sheet}
            onClick={() => setSnap((s) => (s === "full" ? "peek" : SNAPS[SNAPS.indexOf(s) + 1]))}
            onPointerDown={(e) => {
              sheetDrag.current = e.clientY;
            }}
            onPointerUp={(e) => {
              const start = sheetDrag.current;
              sheetDrag.current = null;
              if (start === null) return;
              const dy = e.clientY - start;
              if (Math.abs(dy) > 32) {
                e.preventDefault();
                step(dy < 0 ? 1 : -1);
              }
            }}
            className={`flex h-6 w-full shrink-0 touch-none items-center justify-center md:hidden ${FOCUS_RING}`}
          >
            <span className="h-1.5 w-12 rounded-full bg-line-strong" />
          </button>

          {collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={vi.cockpit.sidebar.expand}
              title={vi.cockpit.sidebar.expand}
              className={`hidden h-full w-full flex-col items-center gap-3 pt-3 text-ink-muted hover:bg-canvas hover:text-ink lg:flex ${FOCUS_RING}`}
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
                <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-sm font-semibold [writing-mode:vertical-rl]">{vi.cockpit.tabs.chat}</span>
            </button>
          )}
          <div className={`min-h-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>{renderSidebar(collapseButton)}</div>
        </aside>
      </div>
    </main>
  );
}
