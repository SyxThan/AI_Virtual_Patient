"use client";

import { useEffect, useState } from "react";
import vi from "../../../messages/vi.json";
import DeleteSessionButton from "@/components/privacy/DeleteSessionButton";
import { GUEST_SESSION_KEY, guestToken } from "@/lib/sessionAuth";

type View = { kind: "loading" } | { kind: "none" } | { kind: "guest"; id: string } | { kind: "deleted" };

/** Lets a guest delete the session this tab holds a token for (it is not in /history). */
export default function GuestSessionDelete() {
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    // sessionStorage only exists in the browser: read it after mount.
    const id = setTimeout(() => {
      let sid: string | null = null;
      try {
        sid = guestToken() ? sessionStorage.getItem(GUEST_SESSION_KEY) : null;
      } catch {
        sid = null;
      }
      setView(sid ? { kind: "guest", id: sid } : { kind: "none" });
    }, 0);
    return () => clearTimeout(id);
  }, []);

  if (view.kind === "loading") return null;
  return (
    <section aria-labelledby="guest-tab-heading" className="space-y-2 rounded-lg border border-gray-200 p-4">
      <h2 id="guest-tab-heading" className="text-base font-semibold text-gray-900">
        {vi.privacy.guestTab.heading}
      </h2>
      {view.kind === "guest" ? (
        <>
          <p className="text-sm text-gray-700">{vi.privacy.guestTab.body}</p>
          <DeleteSessionButton sessionId={view.id} onDeleted={() => setView({ kind: "deleted" })} />
        </>
      ) : (
        <p role={view.kind === "deleted" ? "status" : undefined} className="text-sm text-gray-700">
          {view.kind === "deleted" ? vi.privacy.guestTab.deleted : vi.privacy.guestTab.none}
        </p>
      )}
    </section>
  );
}
