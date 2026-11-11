"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// supabase-js is used for sign-in ONLY (ADR-0008): all data goes through FastAPI.
// Only the public URL and publishable key reach the browser; a secret /
// service-role key must never be set in any NEXT_PUBLIC_ variable.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

let client: SupabaseClient | null | undefined;

function validUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false; // e.g. the "<project-ref>" placeholder from .env.example
  }
}

/** True when sign-in can work; otherwise the app runs guest-only. */
export const authConfigured = Boolean(SUPABASE_KEY) && validUrl(SUPABASE_URL);

/** The browser Supabase client, or null when auth is not configured (or on the server). */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined" || !authConfigured) return null;
  if (client === undefined) {
    try {
      client = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    } catch {
      client = null;
    }
  }
  return client;
}
