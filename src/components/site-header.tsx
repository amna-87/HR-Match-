import Link from "next/link";
import { getSession } from "@/lib/auth/session";

const links = {
  candidate: [
    ["/candidate", "Dashboard"],
    ["/candidate/profile", "Profile"],
    ["/candidate/settings", "Preferences"],
    ["/candidate/privacy", "Privacy"],
  ],
  recruiter: [
    ["/recruiter", "Jobs"],
    ["/recruiter/jobs/new", "Post a job"],
    ["/recruiter/company", "Company"],
  ],
  admin: [
    ["/admin", "Overview"],
    ["/admin/users", "Users"],
    ["/admin/jobs", "Jobs"],
    ["/admin/sourced/new", "Add sourced job"],
    ["/admin/takedowns", "Takedowns"],
    ["/admin/audit", "Audit log"],
  ],
} as const;

export async function SiteHeader() {
  const { profile } = await getSession();
  const appName = process.env.APP_NAME ?? "HireLoop";
  const nav = profile?.onboarded ? links[profile.role] : [];
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          {appName}
        </Link>
        <nav aria-label="Main" className="flex flex-1 flex-wrap gap-4 text-sm">
          <Link href="/jobs" className="hover:underline">
            Browse jobs
          </Link>
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="hover:underline">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {profile ? (
            <>
              <span className="hidden text-muted-foreground sm:inline">{profile.email}</span>
              <form action="/auth/signout" method="post">
                <button className="hover:underline">Sign out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:underline">
                Log in
              </Link>
              <Link href="/signup" className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
