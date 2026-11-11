import { Suspense } from "react";
import AuthCallback from "@/components/auth/AuthCallback";

export default function AuthCallbackPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-8">
      <Suspense fallback={null}>
        <AuthCallback />
      </Suspense>
    </main>
  );
}
