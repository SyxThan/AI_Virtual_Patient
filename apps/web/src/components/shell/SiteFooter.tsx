import Link from "next/link";
import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";
import BrandMark from "./BrandMark";

const LINK = `inline-flex min-h-11 items-center rounded-control text-sm font-semibold text-ink underline-offset-4 hover:underline ${FOCUS_RING}`;

/** Practice-only disclaimer on every page (ADR-0010), the team line, and the privacy / transparency links. */
export default function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pb-8 pt-14 sm:px-6">
      <div className="grid gap-8 rounded-tile bg-surface p-6 ring-1 ring-line/70 sm:p-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <p className="font-display flex items-center gap-2 text-xl font-bold tracking-tight text-ink">
            <BrandMark />
            {vi.nav.brand}
          </p>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">{vi.nav.footer}</p>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-muted">{vi.nav.team}</p>
        </div>
        <nav aria-label={vi.nav.footerLinks}>
          <ul className="flex flex-col gap-1">
            <li>
              <Link href="/setup" className={LINK}>
                {vi.nav.start}
              </Link>
            </li>
            <li>
              <Link href="/transparency" className={LINK}>
                {vi.transparency.navLink}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className={LINK}>
                {vi.privacy.footerLink}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
