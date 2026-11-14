"use client";

import { useRef } from "react";
import vi from "../../../messages/vi.json";
import Modal from "@/components/ui/Modal";
import { buttonClass } from "@/components/ui/Button";
import { fmt } from "@/lib/sessionAuth";

/**
 * Confirmation before "Kết thúc buổi khám": says that no more questions can be
 * asked afterwards. Focus starts on the safe choice (keep examining).
 */
export default function FinishDialog({
  open,
  turnCount,
  finishing,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  turnCount: number;
  finishing: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const f = vi.workspace.finish;

  return (
    <Modal
      open={open}
      onClose={() => !finishing && onCancel()}
      title={f.title}
      description={
        <>
          <p>{f.body}</p>
          <p className="tabular mt-3 font-semibold text-ink">{fmt(f.turns, { n: turnCount })}</p>
        </>
      }
      initialFocusRef={cancelRef}
    >
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink"
        >
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={finishing}
          className={buttonClass({ variant: "secondary" })}
        >
          {f.cancel}
        </button>
        {/* Destructive: the interview cannot be resumed afterwards. */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={finishing}
          aria-busy={finishing}
          className={buttonClass({ variant: "danger" })}
        >
          {finishing ? vi.session.finishing : f.confirm}
        </button>
      </div>
    </Modal>
  );
}
