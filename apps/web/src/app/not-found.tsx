import type { Metadata } from "next";
import Link from "next/link";
import vi from "../../messages/vi.json";
import { buttonClass } from "@/components/ui/Button";
import PageShell from "@/components/ui/PageShell";
import Tile, { TILE_MUTED } from "@/components/ui/Tile";

export const metadata: Metadata = { title: vi.errors.notFoundTitle };

export default function NotFound() {
  return (
    <PageShell>
      <div className="grid gap-4 sm:grid-cols-5">
        <Tile tone="ink" className="flex flex-col justify-between gap-10 sm:col-span-3">
          <p className={`text-sm font-semibold ${TILE_MUTED.ink}`}>{vi.errors.notFoundCode}</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{vi.errors.notFoundTitle}</h1>
        </Tile>
        <Tile tone="surface" className="flex flex-col justify-between gap-6 border border-line sm:col-span-2">
          <p className="text-ink-muted">{vi.errors.notFoundBody}</p>
          <div className="flex flex-col gap-3">
            <Link href="/" className={buttonClass({ variant: "primary", className: "w-full" })}>
              {vi.errors.home}
            </Link>
            <Link href="/setup" className={buttonClass({ variant: "secondary", className: "w-full" })}>
              {vi.errors.start}
            </Link>
          </div>
        </Tile>
      </div>
    </PageShell>
  );
}
