"use client";

import { useId, useState } from "react";
import vi from "../../../messages/vi.json";
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
    <section aria-labelledby={headingId} className="space-y-3 rounded-lg border border-red-300 bg-red-50/40 p-4">
      <h2 id={headingId} className="text-lg font-semibold text-red-900">
        {t.heading}
      </h2>
      <p className="text-sm text-gray-800">{t.body}</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor={inputId} className="text-sm font-medium text-gray-900">
          {fmt(t.prompt, { word: t.word })}
        </label>
        <input
          id={inputId}
          type="text"
          value={typed}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2"
        />
        {error && (
          <p role="alert" className="text-sm text-red-800">
            {t.error}
          </p>
        )}
        <button
          type="submit"
          disabled={!matches || working}
          className="w-fit rounded-md bg-red-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
        >
          {working ? t.working : t.submit}
        </button>
      </form>
    </section>
  );
}
