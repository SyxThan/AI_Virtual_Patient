import Link from "next/link";
import vi from "../../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";

/** Practice-only disclaimer on every page (ADR-0010) and the privacy link (Slice 13). */
export default function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pb-6 pt-10 text-center text-xs text-ink-muted sm:px-6">
      <p>{vi.nav.footer}</p>
      <p className="mt-1">
        <Link href="/privacy" className={`rounded underline hover:text-ink ${FOCUS_RING}`}>
          {vi.privacy.footerLink}
        </Link>
      </p>
    </footer>
  );
}
