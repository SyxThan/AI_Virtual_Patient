import type { Metadata } from "next";
import Link from "next/link";
import vi from "../../../messages/vi.json";
import GuestSessionDelete from "@/components/privacy/GuestSessionDelete";

// Every statement on this page must match what the code does (Slice 13, AVP-115).
// The text is a draft until the team reviews the legal wording.
export const metadata: Metadata = { title: `${vi.privacy.title} · ${vi.app.title}` };

export default function PrivacyPage() {
  const p = vi.privacy;
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <header className="space-y-2">
        <p className="w-fit rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
          {p.draftBadge}
        </p>
        <h1 className="text-2xl font-semibold text-gray-900">{p.title}</h1>
        <p className="text-sm text-gray-700">{p.intro}</p>
      </header>

      {p.sections.map((s) => (
        <section key={s.heading} className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">{s.heading}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-800">
            {s.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}

      <GuestSessionDelete />

      <nav className="flex flex-wrap gap-4 text-sm">
        <Link href="/history" className="text-indigo-700 underline">
          {vi.nav.history}
        </Link>
        <Link href="/profile" className="text-indigo-700 underline">
          {vi.nav.profile}
        </Link>
      </nav>
    </main>
  );
}
