import type { Metadata } from "next";
import Link from "next/link";
import vi from "../../../messages/vi.json";
import GuestSessionDelete from "@/components/privacy/GuestSessionDelete";
import Badge from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageShell from "@/components/ui/PageShell";

// Every statement on this page must match what the code does (Slice 13, AVP-115).
// The text is a draft until the team reviews the legal wording.
// The root layout's title template appends the app name.
export const metadata: Metadata = { title: vi.privacy.title };

export default function PrivacyPage() {
  const p = vi.privacy;
  return (
    <PageShell width="narrow">
      <header className="mb-8 space-y-3">
        <Badge tone="warning">{p.draftBadge}</Badge>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{p.title}</h1>
        <p className="max-w-[68ch] text-ink-muted">{p.intro}</p>
      </header>

      <Card as="article" className="divide-y divide-line">
        {p.sections.map((s) => (
          <section key={s.heading} className="space-y-3 py-6 first:pt-0 last:pb-0">
            <h2 className="text-lg font-bold tracking-tight text-ink">{s.heading}</h2>
            <ul className="max-w-[68ch] list-disc space-y-2 pl-5 leading-relaxed text-ink marker:text-primary">
              {s.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </Card>

      <div className="mt-6">
        <GuestSessionDelete />
      </div>

      <nav aria-label={p.related} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href="/history" className={buttonClass({ variant: "secondary" })}>
          {vi.nav.history}
        </Link>
        <Link href="/profile" className={buttonClass({ variant: "secondary" })}>
          {vi.nav.profile}
        </Link>
      </nav>
    </PageShell>
  );
}
