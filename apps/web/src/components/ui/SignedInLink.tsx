"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

/** A link rendered only for a signed-in user (e.g. "history" on a server-rendered page). */
export default function SignedInLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const { status } = useAuth();
  if (status !== "signedIn") return null;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
