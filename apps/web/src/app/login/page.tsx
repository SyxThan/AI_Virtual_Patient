import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-8">
      {/* useSearchParams (mode/next) needs a Suspense boundary for static rendering. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
