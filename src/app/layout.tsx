import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { SiteHeader } from "@/components/site-header";
import { Logo } from "@/components/logo";
import { appEnv } from "@/lib/app-env";

const appName = process.env.APP_NAME ?? "Vouch";

const env = appEnv();

export const metadata: Metadata = {
  ...(env !== "production" ? { robots: { index: false, follow: false } } : {}),
  metadataBase: new URL((process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")),
  title: { default: `${appName}: jobs that fit you, hiring that respects people`, template: `%s · ${appName}` },
  description:
    "Browse every open job without an account, get matched to roles that fit your skills, and apply only when you choose. Recruiters: bulk-upload resumes and find the best people for each job.",
  openGraph: { siteName: appName, type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={GeistSans.variable}>
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
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">
          {children}
        </main>
        <footer className="border-border bg-card mt-12 border-t">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-[2fr_1fr_1fr]">
            <div className="space-y-3">
              <Logo name={appName} />
              <p className="text-muted-foreground max-w-sm">
                Jobs matched to your skills, and nothing is sent to an employer without your approval.
              </p>
            </div>
            <nav aria-label="Explore" className="space-y-2">
              <p className="font-semibold">Explore</p>
              <ul className="text-muted-foreground space-y-2">
                <li>
                  <Link href="/jobs" className="hover:text-foreground">
                    Browse jobs
                  </Link>
                </li>
                <li>
                  <Link href="/signup?role=candidate" className="hover:text-foreground">
                    Create a profile
                  </Link>
                </li>
                <li>
                  <Link href="/for-recruiters" className="hover:text-foreground">
                    For recruiters
                  </Link>
                </li>
                <li>
                  <Link href="/how-matching-works" className="hover:text-foreground">
                    How matching works
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="hover:text-foreground">
                    About {appName}
                  </Link>
                </li>
              </ul>
            </nav>
            <nav aria-label="Legal" className="space-y-2">
              <p className="font-semibold">Legal</p>
              <ul className="text-muted-foreground space-y-2">
                <li>
                  <Link href="/terms" className="hover:text-foreground">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-foreground">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/takedown" className="hover:text-foreground">
                    Request removal of a listing
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="border-border text-muted-foreground border-t py-4 text-center text-xs">
            © {new Date().getFullYear()} {appName}
          </div>
        </footer>
      </body>
    </html>
  );
}
