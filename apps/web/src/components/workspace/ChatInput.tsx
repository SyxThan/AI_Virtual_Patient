"use client";

import { useId, useState, type Ref } from "react";
import vi from "../../../messages/vi.json";
import Button from "@/components/ui/Button";
import { FOCUS_RING } from "@/components/ui/focus";

export const MAX_TURN_CHARS = 2000;

/**
 * Text turn input (always available; the fallback whenever voice is not).
 * `busy` blocks sending while a reply is pending; `lockedReason` disables the
 * input for good (time limit reached / session over) and says why.
 */
export default function ChatInput({
  onSend,
  busy,
  lockedReason,
  inputRef,
}: {
  onSend: (text: string) => void;
  busy: boolean;
  lockedReason?: string | null;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [text, setText] = useState("");
  const id = useId();
  const locked = !!lockedReason;

  function submit() {
    const t = text.trim();
    if (!t || busy || locked) return;
    onSend(t);
    setText("");
  }

  return (
    <form
      className="flex flex-col gap-1.5 px-4 pb-4 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {vi.workspace.inputLabel}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={locked ? (lockedReason ?? "") : vi.session.inputPlaceholder}
          disabled={locked}
          maxLength={MAX_TURN_CHARS}
          autoComplete="off"
          aria-describedby={locked ? `${id}-locked` : undefined}
          className={`h-11 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-4 text-base text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-canvas sm:text-sm ${FOCUS_RING}`}
        />
        <Button type="submit" variant="secondary" disabled={busy || locked || !text.trim()} className="shrink-0">
          {vi.session.send}
        </Button>
      </div>
      {locked && (
        <p id={`${id}-locked`} className="text-sm text-ink-muted">
          {lockedReason}
        </p>
      )}
    </form>
  );
}
