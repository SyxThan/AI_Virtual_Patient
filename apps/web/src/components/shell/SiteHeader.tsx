"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import vi from "../../../messages/vi.json";
import { useAuth } from "@/components/auth/AuthProvider";
import { FOCUS_RING } from "@/components/ui/focus";

/** Moves keyboard focus to the page's <main> (works on every page, no id needed). */
function skipToMain(e: React.MouseEvent<HTMLAnchorElement>) {
  const main = document.querySelector("main");
  if (!main) return;
  e.preventDefault();
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  main.focus();
  main.scrollIntoView();
}

/**
 * App header: brand, start, history (signed in) and the account menu or sign-in
 * link. Below the `sm` breakpoint the links collapse into a disclosure menu
 * (button with aria-expanded/aria-controls; Escape closes and returns focus).
 */
export default function SiteHeader() {
  const { status, email, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // desktop account menu
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);

  // Close both menus after navigation (state adjusted during render, no effect).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
    setMobileOpen(false);
  }

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

  useEffect(() => {
    if (!mobileOpen) return;
    const onDown = (e: MouseEvent) => {
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) setMobileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        mobileButtonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  async function handleSignOut() {
    setOpen(false);
    setMobileOpen(false);
    await signOut();
    router.push("/");
  }

  const signedIn = status === "signedIn";
  const linkCls = `rounded px-1 py-0.5 text-gray-800 hover:underline ${FOCUS_RING}`;
  const mobileLinkCls = `block rounded-md px-3 py-2.5 text-gray-900 hover:bg-gray-100 ${FOCUS_RING}`;

  return (
    <header className="border-b border-gray-200 bg-white">
      <a
        href="#main"
        onClick={skipToMain}
        className={`sr-only z-50 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow focus:not-sr-only focus:fixed focus:left-2 focus:top-2 ${FOCUS_RING}`}
      >
        {vi.a11y.skipToContent}
      </a>
      <nav
        aria-label={vi.a11y.mainNav}
        className="relative mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3"
        ref={mobileRef}
      >
        <Link href="/" className={`rounded font-semibold text-gray-900 ${FOCUS_RING}`}>
          {vi.nav.brand}
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-4 text-sm sm:flex">
          <Link href="/setup" className={linkCls}>
            {vi.nav.start}
          </Link>
          {signedIn && (
            <Link href="/history" className={linkCls}>
              {vi.nav.history}
            </Link>
          )}
          {signedIn ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={vi.nav.menuLabel}
                onClick={() => setOpen((o) => !o)}
                className={`rounded-md border border-gray-400 px-3 py-1.5 text-gray-900 ${FOCUS_RING}`}
              >
                {vi.nav.account}
              </button>
              {open && (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-2 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                >
                  {email && (
                    <p className="truncate px-3 py-2 text-xs text-gray-600" title={email}>
                      {email}
                    </p>
                  )}
                  <Link
                    href="/profile"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className={`block px-3 py-2 hover:bg-gray-50 ${FOCUS_RING}`}
                  >
                    {vi.nav.profile}
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    className={`block w-full px-3 py-2 text-left hover:bg-gray-50 ${FOCUS_RING}`}
                  >
                    {vi.nav.signOut}
                  </button>
                </div>
              )}
            </div>
          ) : status === "loading" ? (
            <span className="w-20" aria-hidden />
          ) : (
            <Link
              href="/login"
              className={`rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-700 ${FOCUS_RING}`}
            >
              {vi.nav.signIn}
            </Link>
          )}
        </div>

        {/* Mobile */}
        <button
          ref={mobileButtonRef}
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          aria-label={mobileOpen ? vi.a11y.closeMenu : vi.a11y.openMenu}
          onClick={() => setMobileOpen((o) => !o)}
          className={`rounded-md border border-gray-400 p-2 text-gray-900 sm:hidden ${FOCUS_RING}`}
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
            {mobileOpen ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
        {mobileOpen && (
          <div
            id="mobile-nav"
            className="absolute inset-x-0 top-full z-30 border-b border-gray-200 bg-white px-4 py-2 shadow-lg sm:hidden"
          >
            <ul className="flex flex-col gap-1 text-base">
              <li>
                <Link href="/setup" className={mobileLinkCls} onClick={() => setMobileOpen(false)}>
                  {vi.nav.start}
                </Link>
              </li>
              {signedIn && (
                <>
                  <li>
                    <Link
                      href="/history"
                      className={mobileLinkCls}
                      onClick={() => setMobileOpen(false)}
                    >
                      {vi.nav.history}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/profile"
                      className={mobileLinkCls}
                      onClick={() => setMobileOpen(false)}
                    >
                      {vi.nav.profile}
                    </Link>
                  </li>
                  {email && (
                    <li className="truncate px-3 pt-2 text-xs text-gray-600" title={email}>
                      {email}
                    </li>
                  )}
                  <li>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className={`${mobileLinkCls} w-full text-left`}
                    >
                      {vi.nav.signOut}
                    </button>
                  </li>
                </>
              )}
              {(status === "signedOut" || status === "unavailable") && (
                <li>
                  <Link href="/login" className={mobileLinkCls} onClick={() => setMobileOpen(false)}>
                    {vi.nav.signIn}
                  </Link>
                </li>
              )}
            </ul>
          </div>
        )}
      </nav>
    </header>
  );
}
