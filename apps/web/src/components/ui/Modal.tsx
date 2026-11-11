"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";
import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "./focus";
import { useFocusTrap } from "./useFocusTrap";

/**
 * Accessible modal dialog: role="dialog" + aria-modal, labelled by its title and
 * described by `description`; focus is moved inside and trapped, Escape closes,
 * focus returns to the opener on close, page scroll is locked while open.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  initialFocusRef,
  closeOnBackdrop = true,
  showClose = true,
  className = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  showClose?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, onClose, initialFocusRef);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 text-gray-900 shadow-xl outline-none sm:rounded-xl ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {showClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={vi.a11y.close}
              className={`-m-1 rounded-md p-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
        {description && (
          <div id={descId} className="mt-2 text-sm leading-relaxed text-gray-700">
            {description}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
