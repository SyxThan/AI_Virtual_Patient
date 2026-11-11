import type { Metadata } from "next";
import Link from "next/link";
import vi from "../../messages/vi.json";
import { FOCUS_RING } from "@/components/ui/focus";

export const metadata: Metadata = { title: vi.errors.notFoundTitle };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16 sm:px-6">
      <p className="text-sm font-semibold text-blue-800">404</p>
      <h1 className="text-2xl font-semibold text-gray-900">{vi.errors.notFoundTitle}</h1>
      <p className="text-gray-700">{vi.errors.notFoundBody}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Link
          href="/"
          className={`rounded-md bg-gray-900 px-4 py-2 font-medium text-white hover:bg-gray-700 ${FOCUS_RING}`}
        >
          {vi.errors.home}
        </Link>
        <Link
          href="/setup"
          className={`rounded-md border border-gray-400 px-4 py-2 font-medium text-gray-900 hover:bg-gray-50 ${FOCUS_RING}`}
        >
          {vi.errors.start}
        </Link>
      </div>
    </main>
  );
}
