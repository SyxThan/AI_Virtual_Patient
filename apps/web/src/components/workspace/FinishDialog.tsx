"use client";

import { useRef } from "react";
import vi from "../../../messages/vi.json";
import Modal from "@/components/ui/Modal";
import { FOCUS_RING } from "@/components/ui/focus";
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
          <p className="mt-2 text-gray-600">{fmt(f.turns, { n: turnCount })}</p>
        </>
      }
      initialFocusRef={cancelRef}
    >
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={finishing}
          className={`rounded-md border border-gray-400 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50 ${FOCUS_RING}`}
        >
          {f.cancel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={finishing}
          aria-busy={finishing}
          className={`rounded-md bg-red-800 px-4 py-2 text-sm font-medium text-white hover:bg-red-900 disabled:opacity-60 ${FOCUS_RING}`}
        >
          {finishing ? vi.session.finishing : f.confirm}
        </button>
      </div>
    </Modal>
  );
}
