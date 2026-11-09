import type { Metadata } from "next";
import "./globals.css";
import vi from "../../messages/vi.json";

export const metadata: Metadata = {
  title: vi.app.title,
  description: vi.app.description,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // UI language is Vietnamese (CLAUDE.md "Working agreements").
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
