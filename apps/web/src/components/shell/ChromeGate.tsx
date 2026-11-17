"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Hides the site header and footer on the clinical workspace (`/session/<id>`),
 * which is a full-viewport app frame with its own top bar (no page scroll), and
 * on `/setup`, which fits one screen on desktop and has its own top bar.
 * Everywhere else the children render unchanged.
 */
export default function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/session/") || pathname === "/setup") return null;
  return <>{children}</>;
}
