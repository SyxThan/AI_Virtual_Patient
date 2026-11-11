"use client";

import { useEffect, useId, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  children: React.ReactNode;
  /** The action buttons; the first focusable element gets focus on open. */
  actions: React.ReactNode;
  /** Escape / backdrop-less cancel. Ignored while `busy`. */
  onCancel: () => void;
  busy?: boolean;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal confirm dialog: native <dialog> opened with showModal() (the
 * rest of the page is inert), Tab / Shift+Tab cycle inside it, Escape cancels,
 * and focus returns to the element that opened it.
 */
export default function ConfirmDialog({ open, title, children, actions, onCancel, busy }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      opener.current?.focus?.();
    }
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (e.key === "Escape") {
      e.preventDefault(); // we decide (busy dialogs stay open)
      if (!busy) onCancel();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault(); // native Escape path: same rule as onKeyDown
        if (!busy) onCancel();
      }}
      className="w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-gray-200 p-0 text-left shadow-xl backdrop:bg-black/40"
    >
      <div className="space-y-3 p-5">
        <h2 id={titleId} className="text-lg font-semibold text-gray-900">
          {title}
        </h2>
        <div id={bodyId} className="space-y-2 text-sm text-gray-700">
          {children}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">{actions}</div>
      </div>
    </dialog>
  );
}
