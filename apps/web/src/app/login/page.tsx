import { Suspense } from "react";
import vi from "../../../messages/vi.json";
import LoginForm from "@/components/auth/LoginForm";
import Card from "@/components/ui/Card";
import PageShell from "@/components/ui/PageShell";
import Tile, { TILE_MUTED } from "@/components/ui/Tile";

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
      <path
        d="M4.5 10.5l3.5 3.5 7.5-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LoginPage() {
  const a = vi.auth;
  return (
    <PageShell>
      <div className="grid items-start gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="mx-auto max-w-md">
            {/* useSearchParams (mode/next) needs a Suspense boundary for static rendering. */}
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </div>
        </Card>
        <Tile tone="ink" as="aside" aria-labelledby="login-aside-title" className="lg:col-span-2">
          <h2 id="login-aside-title" className="text-xl font-bold tracking-tight">
            {a.asideTitle}
          </h2>
          <p className={`mt-3 ${TILE_MUTED.ink}`}>{a.asideBody}</p>
          <ul className="mt-6 space-y-3">
            {a.asidePoints.map((point) => (
              <li key={point} className="flex gap-3">
                <span className="text-primary-soft">
                  <CheckIcon />
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <p className={`mt-8 border-t border-ink-inverse-muted/30 pt-4 text-sm ${TILE_MUTED.ink}`}>{a.asideNote}</p>
        </Tile>
      </div>
    </PageShell>
  );
}
