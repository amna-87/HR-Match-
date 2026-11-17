import Link from "next/link";
import { LogOut } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { Logo } from "@/components/logo";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { buttonClasses } from "@/components/ui/button";

const links: Record<"candidate" | "recruiter" | "admin", NavItem[]> = {
  candidate: [
    ["/candidate", "Dashboard"],
    ["/candidate/profile", "Profile"],
    ["/candidate/settings", "Preferences"],
    ["/candidate/privacy", "Privacy"],
  ],
  recruiter: [
    ["/recruiter", "Jobs"],
    ["/recruiter/jobs/new", "Post a job"],
    ["/recruiter/talent", "Talent pool"],
    ["/recruiter/company", "Company"],
  ],
  admin: [
    ["/admin", "Overview"],
    ["/admin/jobs", "Jobs"],
    ["/admin/sourced/new", "Add job"],
    ["/admin/users", "Users"],
    ["/admin/takedowns", "Takedowns"],
    ["/admin/audit", "Audit log"],
  ],
};

export async function SiteHeader() {
  const { profile } = await getSession();
  const appName = process.env.APP_NAME ?? "Vouch";
  const items: NavItem[] = [["/jobs", "Browse jobs"], ...(profile?.onboarded ? links[profile.role] : [])];
  const account = profile ? (
    <>
      <span className="bg-muted text-muted-foreground flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm">
        <span
          aria-hidden
          className="bg-primary text-primary-foreground inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold uppercase"
        >
          {profile.email.slice(0, 1)}
        </span>
        <span className="max-w-[14rem] truncate">{profile.email}</span>
      </span>
      <form action="/auth/signout" method="post">
        <button className={buttonClasses("ghost", "sm")}>
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </form>
    </>
  ) : (
    <>
      <Link href="/login" className={buttonClasses("ghost", "sm")}>
        Log in
      </Link>
      <Link href="/signup" className={buttonClasses("default", "sm")}>
        Sign up free
      </Link>
    </>
  );
  return (
    <header className="border-border/70 bg-background/80 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Logo name={appName} />
        <NavLinks items={items} account={account} />
      </div>
    </header>
  );
}
