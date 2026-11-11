"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import vi from "../../../messages/vi.json";
import { useAuth } from "@/components/auth/AuthProvider";

/** App header: brand, start, history (signed in) and the account menu or sign-in link. */
export default function SiteHeader() {
  const { status, email, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    router.push("/");
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-semibold">
          {vi.nav.brand}
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/setup" className="hover:underline">
            {vi.nav.start}
          </Link>
          {status === "signedIn" && (
            <Link href="/history" className="hover:underline">
              {vi.nav.history}
            </Link>
          )}
          {status === "signedIn" ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={vi.nav.menuLabel}
                onClick={() => setOpen((o) => !o)}
                className="rounded-md border border-gray-300 px-3 py-1.5"
              >
                {vi.nav.account}
              </button>
              {open && (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-2 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                >
                  {email && (
                    <p className="truncate px-3 py-2 text-xs text-gray-500" title={email}>
                      {email}
                    </p>
                  )}
                  <Link
                    href="/profile"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 hover:bg-gray-50"
                  >
                    {vi.nav.profile}
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                  >
                    {vi.nav.signOut}
                  </button>
                </div>
              )}
            </div>
          ) : status === "loading" ? (
            <span className="w-20" aria-hidden />
          ) : (
            <Link href="/login" className="rounded-md bg-black px-3 py-1.5 text-white">
              {vi.nav.signIn}
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
