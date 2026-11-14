"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import vi from "../../../messages/vi.json";
import { useAuth } from "@/components/auth/AuthProvider";
import DeleteMyDataSection, { type DeleteMeResult } from "@/components/privacy/DeleteMyDataSection";
import { buttonClass } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { FOCUS_RING } from "@/components/ui/focus";
import PageShell from "@/components/ui/PageShell";
import { API_URL, authHeaders, fmt } from "@/lib/sessionAuth";

// Local type for GET/PATCH /api/v1/me (the generated client is regenerated separately).
type Me = { user_id: string; display_name: string | null; role: string; created_at: string };

const MAX_NAME = 80;

const INPUT = `h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink ${FOCUS_RING}`;
// Load/save failures are not destructive actions, so they use the warning tone.
const ALERT = "rounded-control border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning";

export default function ProfilePage() {
  const { status, email, signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleted, setDeleted] = useState<DeleteMeResult | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  async function onDataDeleted(result: DeleteMeResult) {
    setDeleted(result);
    try {
      await signOut();
      setSignedOut(true);
    } catch {
      setSignedOut(false);
    }
  }

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

  if (deleted) {
    const t = vi.privacy.deleteMe;
    return (
      <PageShell width="narrow" title={t.heading}>
        <Card role="status" className="space-y-3 text-ink">
          <p className="font-semibold">{fmt(t.done, { sessions: deleted.sessions_deleted })}</p>
          {deleted.profile_deleted && <p>{t.profileDeleted}</p>}
          {deleted.account_deleted ? <p>{t.accountDeleted}</p> : <p className={ALERT}>{t.accountKept}</p>}
          {signedOut && <p className="text-ink-muted">{t.signedOut}</p>}
        </Card>
        <Link href="/" className={buttonClass({ variant: "primary", className: "mt-6 w-full sm:w-fit" })}>
          {t.home}
        </Link>
      </PageShell>
    );
  }
  if (status === "loading") {
    return (
      <PageShell width="narrow" title={vi.profile.title}>
        <p role="status" className="text-ink-muted">
          {vi.profile.loading}
        </p>
      </PageShell>
    );
  }
  if (status !== "signedIn") {
    return (
      <PageShell width="narrow" title={vi.profile.title}>
        <Card className="space-y-5">
          <p className="text-ink">{vi.profile.signInRequired}</p>
          <Link href="/login?next=/profile" className={buttonClass({ variant: "primary", className: "w-full sm:w-fit" })}>
            {vi.profile.signInLink}
          </Link>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell width="narrow" title={vi.profile.title}>
      <div className="space-y-6">
        <Card aria-labelledby="profile-account-heading" className="space-y-5">
          <h2 id="profile-account-heading" className="text-xl font-bold tracking-tight text-ink">
            {vi.profile.accountHeading}
          </h2>
          {loadError ? (
            <div role="alert" className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${ALERT}`}>
              <span>{vi.profile.loadError}</span>
              <button type="button" onClick={load} className={buttonClass({ variant: "secondary", size: "md" })}>
                {vi.profile.retry}
              </button>
            </div>
          ) : !me ? (
            <p role="status" className="text-ink-muted">
              {vi.profile.loading}
            </p>
          ) : (
            <form onSubmit={save} className="flex flex-col gap-5">
              <div className="text-sm">
                <span className="font-semibold text-ink">{vi.profile.email}</span>
                <p className="mt-1 break-all text-base text-ink-muted">{email}</p>
              </div>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-semibold text-ink">{vi.profile.displayName}</span>
                <input
                  type="text"
                  value={name}
                  maxLength={MAX_NAME}
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT}
                />
                <span className="text-sm text-ink-muted">{vi.profile.displayNameHint}</span>
              </label>
              {message && (
                <p
                  role={message.ok ? "status" : "alert"}
                  className={message.ok ? "text-sm font-medium text-success" : ALERT}
                >
                  {message.text}
                </p>
              )}
              <button
                type="submit"
                disabled={saving}
                className={buttonClass({ variant: "primary", className: "w-full sm:w-fit" })}
              >
                {saving ? vi.profile.saving : vi.profile.save}
              </button>
            </form>
          )}
        </Card>
        <DeleteMyDataSection onDone={(r) => void onDataDeleted(r)} />
      </div>
    </PageShell>
  );
}
