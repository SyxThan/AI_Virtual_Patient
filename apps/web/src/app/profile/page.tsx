"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import vi from "../../../messages/vi.json";
import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL, authHeaders } from "@/lib/sessionAuth";

// Local type for GET/PATCH /api/v1/me (the generated client is regenerated separately).
type Me = { user_id: string; display_name: string | null; role: string; created_at: string };

const MAX_NAME = 80;

export default function ProfilePage() {
  const { status, email } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch(`${API_URL}/api/v1/me`, { headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Me;
      setMe(data);
      setName(data.display_name ?? "");
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (status !== "signedIn") return;
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [status, load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const trimmed = name.trim();
    if (trimmed.length > MAX_NAME) {
      setMessage({ ok: false, text: vi.profile.tooLong });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ display_name: trimmed || null }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Me;
      setMe(data);
      setName(data.display_name ?? "");
      setMessage({ ok: true, text: vi.profile.saved });
    } catch {
      setMessage({ ok: false, text: vi.profile.saveError });
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return <main className="mx-auto max-w-md p-8">{vi.profile.loading}</main>;
  }
  if (status !== "signedIn") {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-8">
        <h1 className="text-2xl font-semibold">{vi.profile.title}</h1>
        <p>{vi.profile.signInRequired}</p>
        <Link href="/login?next=/profile" className="w-fit rounded-md bg-black px-4 py-2 text-white">
          {vi.profile.signInLink}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">{vi.profile.title}</h1>
      {loadError ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-red-800">
          <span>{vi.profile.loadError}</span>
          <button type="button" onClick={load} className="underline">
            {vi.profile.retry}
          </button>
        </div>
      ) : !me ? (
        <p role="status">{vi.profile.loading}</p>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="text-sm">
            <span className="font-medium">{vi.profile.email}</span>
            <p className="text-gray-700">{email}</p>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{vi.profile.displayName}</span>
            <input
              type="text"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2"
            />
            <span className="text-xs text-gray-500">{vi.profile.displayNameHint}</span>
          </label>
          {message && (
            <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-green-700" : "text-sm text-red-700"}>
              {message.text}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-fit rounded-md bg-black px-5 py-2.5 text-white disabled:opacity-50"
          >
            {saving ? vi.profile.saving : vi.profile.save}
          </button>
        </form>
      )}
    </main>
  );
}
