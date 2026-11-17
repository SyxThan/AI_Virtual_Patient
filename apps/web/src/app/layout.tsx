import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import vi from "../../messages/vi.json";
import { AuthProvider } from "@/components/auth/AuthProvider";
import ClaimGuestSession from "@/components/auth/ClaimGuestSession";
import SiteFooter from "@/components/shell/SiteFooter";
import SiteHeader from "@/components/shell/SiteHeader";

// Body face, designed for Vietnamese diacritics; self-hosted by next/font (no runtime request to Google).
const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"], // 800 is not used anywhere
  variable: "--font-be-vietnam",
  display: "swap",
});

// Display face for titles and big numbers (Vietnamese subset). Weight axis only:
// the opsz/wdth axes tripled the preloaded file and slowed the hero's first render (AVP-142).
const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "vietnamese"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  // Pages set a short title; the template appends the app name.
  title: { default: vi.app.title, template: `%s · ${vi.app.title}` },
  description: vi.app.description,
  applicationName: vi.app.title,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#eef3f2",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // UI language is Vietnamese (CLAUDE.md "Working agreements").
  return (
    // `js` is added before first paint so entrance animations can hide elements
    // only when JavaScript runs (without JS, everything shows in its final state).
    <html lang="vi" className={`${beVietnam.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="flex min-h-screen flex-col bg-canvas text-ink">
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
