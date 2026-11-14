"use client";

import { useId, useState } from "react";
import vi from "../../../messages/vi.json";
import { buttonClass } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { FOCUS_RING } from "@/components/ui/focus";
import { API_URL, authHeaders, fmt } from "@/lib/sessionAuth";

// Local type for DELETE /api/v1/me (DeleteMeResponse in docs/specs/openapi.yaml).
export type DeleteMeResult = {
  sessions_deleted: number;
  profile_deleted: boolean;
  account_deleted: boolean;
};

/** "XOÁ", "xoá" and "XOA" all match (diacritics are hard on some keyboards). */
function normalizeWord(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").trim().toUpperCase();
}

/**
 * Profile danger zone (Slice 13): type the confirmation word, then
 * DELETE /api/v1/me. The parent shows the result and signs the user out.
 */
export default function DeleteMyDataSection({ onDone }: { onDone: (r: DeleteMeResult) => void }) {
  const t = vi.privacy.deleteMe;
  const [typed, setTyped] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const inputId = useId();
  const headingId = useId();
  const matches = normalizeWord(typed) === normalizeWord(t.word);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!matches || working) return;
    setWorking(true);
    setError(false);
    try {
      const res = await fetch(`${API_URL}/api/v1/me`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      onDone((await res.json()) as DeleteMeResult);
    } catch {
      setError(true);
      setWorking(false);
    }
  }

  return (
    <Card aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="text-xl font-bold tracking-tight text-ink">
        {t.heading}
      </h2>
      <p className="text-ink-muted">{t.body}</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor={inputId} className="text-sm font-semibold text-ink">
          {fmt(t.prompt, { word: t.word })}
        </label>
        <input
          id={inputId}
          type="text"
          value={typed}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
          className={`h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink sm:max-w-xs ${FOCUS_RING}`}
        />
        {error && (
          <p role="alert" className="rounded-control border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            {t.error}
          </p>
        )}
        <button
          type="submit"
          disabled={!matches || working}
          className={buttonClass({ variant: "danger", className: "w-full sm:w-fit" })}
        >
          {working ? t.working : t.submit}
        </button>
      </form>
    </Card>
  );
}
