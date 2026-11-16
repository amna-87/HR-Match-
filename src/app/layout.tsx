import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { appEnv } from "@/lib/app-env";

const appName = process.env.APP_NAME ?? "Vouch";

const env = appEnv();

export const metadata: Metadata = {
  ...(env !== "production" ? { robots: { index: false, follow: false } } : {}),
  title: { default: appName, template: `%s · ${appName}` },
  description: "Your resume gets matched to jobs automatically, and nothing happens without your permission.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col antialiased">
        <a
          href="#main"
          className="focus:bg-card sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:p-2"
        >
          Skip to content
        </a>
        {env !== "production" && (
          <div role="note" className="bg-amber-300 px-4 py-1 text-center text-sm font-medium text-amber-950">
            {env === "staging" ? "Staging environment — test data only, emails may not be real." : "Local development"}
          </div>
        )}
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-border text-muted-foreground border-t py-6 text-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-4 px-4">
            <span>© {appName}</span>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/takedown" className="hover:underline">
              Request removal of a listing
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
