"use client";

import Link from "next/link";
import vi from "../../../messages/vi.json";
import { useAuth } from "@/components/auth/AuthProvider";
import BrandMark from "@/components/shell/BrandMark";
import { FOCUS_RING } from "@/components/ui/focus";

/**
 * Setup's own top bar (the site header is hidden on /setup by ChromeGate):
 * brand on the left, the account chip on the right. Replaces the old
 * "Tài khoản" tile.
 */
export default function SetupTopBar() {
  const { status, email } = useAuth();

  return (
    <header className="mx-auto flex h-14 w-full max-w-[1680px] shrink-0 items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4 lg:px-8">
      <Link
        href="/"
        className={`-ml-1 inline-flex min-h-11 min-w-0 items-center gap-1.5 whitespace-nowrap rounded-control px-1 font-display text-base font-bold tracking-tight text-ink sm:gap-2 sm:text-lg ${FOCUS_RING}`}
      >
        <BrandMark />
        <span className="truncate">{vi.nav.brand}</span>
      </Link>

      <div className="flex min-w-0 items-center gap-1 whitespace-nowrap rounded-full bg-surface py-1 pl-2.5 pr-1 text-sm ring-1 ring-line/70 sm:gap-2 sm:pl-3">
        {status === "loading" ? (
          <span className="my-2.5 mr-2 h-4 w-40 animate-pulse rounded-full bg-canvas motion-reduce:animate-none" />
        ) : status === "signedIn" ? (
          <span className="flex min-w-0 items-center gap-2 py-2 pr-2">
            <span className="max-w-[16ch] truncate font-semibold text-ink" title={email ?? undefined}>
              {email}
            </span>
            <span aria-hidden="true" className="hidden text-ink-muted sm:inline">·</span>
            <span className="hidden text-ink-muted sm:inline">{vi.setupUx.account.signedIn}</span>
          </span>
        ) : (
          <>
            <span className="font-semibold text-ink">{vi.setupUx.account.guest}</span>
            {status === "signedOut" && (
              <Link
                href="/login?next=/setup"
                className={`inline-flex min-h-11 items-center rounded-full px-2.5 font-semibold sm:px-3 text-primary underline-offset-4 hover:bg-primary-soft hover:underline ${FOCUS_RING}`}
              >
                <span className="sm:hidden">{vi.nav.signIn}</span>
                <span className="hidden sm:inline">{vi.setupUx.account.guestSignIn}</span>
              </Link>
            )}
            {status === "unavailable" && <span className="w-2" />}
          </>
        )}
      </div>
    </header>
  );
}
