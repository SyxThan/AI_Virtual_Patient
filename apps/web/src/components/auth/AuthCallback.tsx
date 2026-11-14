"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import vi from "../../../messages/vi.json";
import { safeNext } from "@/components/auth/authErrors";
import { buttonClass } from "@/components/ui/Button";
import { getSupabase } from "@/lib/supabaseClient";

/**
 * Landing page for magic-link, sign-up confirmation and password-reset emails.
 * supabase-js (PKCE, detectSessionInUrl) exchanges the `?code=` itself while it
 * initialises; getSession() waits for that, then we continue to `next`.
 */
export default function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    const next = safeNext(params.get("next"));
    if (!supabase || params.get("error") || params.get("error_description")) {
      const id = setTimeout(() => setFailed(true), 0);
      return () => clearTimeout(id);
    }
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data.session) setFailed(true);
        else router.replace(next);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [params, router]);

  if (!failed) {
    return (
      <p role="status" className="flex items-center gap-3 text-ink">
        <span
          className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-primary motion-reduce:animate-none"
          aria-hidden="true"
        />
        {vi.auth.callback.working}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <p
        role="alert"
        className="rounded-control border border-warning/30 bg-warning-soft px-4 py-3 text-warning"
      >
        {vi.auth.callback.failed}
      </p>
      <Link href="/login" className={buttonClass({ variant: "primary", className: "w-full sm:w-fit" })}>
        {vi.auth.callback.back}
      </Link>
    </div>
  );
}
