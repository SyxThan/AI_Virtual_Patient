"use client";

import { useState } from "react";
import vi from "../../../messages/vi.json";

export default function ChatInput({
  onSend,
  loading,
}: {
  onSend: (text: string) => void;
  loading: boolean;
}) {
  const [text, setText] = useState("");

  function submit() {
    const t = text.trim();
    if (!t || loading) return;
    onSend(t);
    setText("");
  }

  return (
    <div className="flex items-center gap-2 border-t border-gray-200 p-3">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={vi.session.inputPlaceholder}
        disabled={loading}
        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
      />
      <button
        type="button"
        onClick={submit}
        disabled={loading || !text.trim()}
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {loading ? vi.session.sending : vi.session.send}
      </button>
    </div>
  );
}
