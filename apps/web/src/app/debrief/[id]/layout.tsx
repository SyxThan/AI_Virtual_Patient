import type { Metadata } from "next";
import vi from "../../../../messages/vi.json";

// Route title (the root layout's template appends the app name).
export const metadata: Metadata = { title: vi.debrief.title };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
