import type { Metadata, Viewport } from "next";
import "./globals.css";
import vi from "../../messages/vi.json";
import { AuthProvider } from "@/components/auth/AuthProvider";
import ClaimGuestSession from "@/components/auth/ClaimGuestSession";
import SiteFooter from "@/components/shell/SiteFooter";
import SiteHeader from "@/components/shell/SiteHeader";

export const metadata: Metadata = {
  // Pages set a short title; the template appends the app name.
  title: { default: vi.app.title, template: `%s · ${vi.app.title}` },
  description: vi.app.description,
  applicationName: vi.app.title,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // UI language is Vietnamese (CLAUDE.md "Working agreements").
  return (
    <html lang="vi">
      <body className="flex min-h-screen flex-col">
        <AuthProvider>
          <SiteHeader />
          <ClaimGuestSession />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
