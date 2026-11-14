import { Suspense } from "react";
import AuthCallback from "@/components/auth/AuthCallback";
import Card from "@/components/ui/Card";
import PageShell from "@/components/ui/PageShell";

export default function AuthCallbackPage() {
  return (
    <PageShell width="narrow">
      <Card className="mx-auto max-w-md">
        <Suspense fallback={null}>
          <AuthCallback />
        </Suspense>
      </Card>
    </PageShell>
  );
}
