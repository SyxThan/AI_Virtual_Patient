import vi from "../../../messages/vi.json";

/** Practice-only disclaimer on every page (ADR-0010). */
export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 px-4 py-4 text-center text-xs text-gray-500">
      {vi.nav.footer}
    </footer>
  );
}
