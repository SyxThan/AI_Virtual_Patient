"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import vi from "../../../messages/vi.json";
import { safeNext } from "@/components/auth/authErrors";
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

  if (!failed) return <p role="status">{vi.auth.callback.working}</p>;
  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">
        {vi.auth.callback.failed}
      </p>
      <Link href="/login" className="w-fit underline">
        {vi.auth.callback.back}
      </Link>
    </div>
  );
}
