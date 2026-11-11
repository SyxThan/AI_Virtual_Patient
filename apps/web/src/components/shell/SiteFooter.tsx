import Link from "next/link";
import vi from "../../../messages/vi.json";

/** Practice-only disclaimer on every page (ADR-0010) and the privacy link (Slice 13). */
export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 px-4 py-4 text-center text-xs text-gray-500">
      <p>{vi.nav.footer}</p>
      <p className="mt-1">
        <Link href="/privacy" className="underline hover:text-gray-700">
          {vi.privacy.footerLink}
        </Link>
      </p>
    </footer>
  );
}
