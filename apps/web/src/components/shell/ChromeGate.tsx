"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Hides the site header and footer on the clinical workspace (`/session/<id>`),
 * which is a full-viewport app frame with its own top bar (no page scroll).
 * Everywhere else the children render unchanged.
 */
export default function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/session/")) return null;
  return <>{children}</>;
}
