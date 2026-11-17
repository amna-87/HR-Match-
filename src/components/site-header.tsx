import Link from "next/link";
import {
  Briefcase,
  Building2,
  FileCheck2,
  LayoutDashboard,
  ScrollText,
  Settings,
  Shield,
  UserRound,
  Users,
} from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { Logo } from "@/components/logo";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { AccountMenu, type AccountLink } from "@/components/account-menu";
import { buttonClasses } from "@/components/ui/button";

type Role = "candidate" | "recruiter" | "admin";

const links: Record<Role, NavItem[]> = {
  candidate: [
    ["/candidate", "Dashboard"],
    ["/candidate/profile", "Profile"],
    ["/candidate/settings", "Preferences"],
  ],
  recruiter: [
    ["/recruiter", "Jobs"],
    ["/recruiter/jobs/new", "Post a job"],
    ["/recruiter/talent", "Talent pool"],
  ],
  admin: [
    ["/admin", "Overview"],
    ["/admin/jobs", "Jobs"],
    ["/admin/sourced/new", "Add job"],
    ["/admin/users", "Users"],
    ["/admin/takedowns", "Takedowns"],
  ],
};

/** Links in the profile dropdown, per role. */
const accountLinks: Record<Role, AccountLink[]> = {
  candidate: [
    { href: "/candidate", label: "My dashboard", icon: <LayoutDashboard /> },
    { href: "/candidate/profile", label: "My profile & resume", icon: <UserRound /> },
    { href: "/candidate/settings", label: "Job preferences & emails", icon: <Settings /> },
    { href: "/candidate/privacy", label: "Privacy & my data", icon: <Shield /> },
  ],
  recruiter: [
    { href: "/recruiter", label: "My jobs", icon: <Briefcase /> },
    { href: "/recruiter/company", label: "Company profile & team", icon: <Building2 /> },
    { href: "/recruiter/talent", label: "Talent pool", icon: <Users /> },
  ],
  admin: [
    { href: "/admin", label: "Admin overview", icon: <LayoutDashboard /> },
    { href: "/admin/jobs", label: "Job moderation", icon: <FileCheck2 /> },
    { href: "/admin/audit", label: "Audit log", icon: <ScrollText /> },
  ],
};

const roleLabels: Record<Role, string> = { candidate: "Job seeker", recruiter: "Recruiter", admin: "Admin" };

export async function SiteHeader() {
  const { profile, user } = await getSession();
  const appName = process.env.APP_NAME ?? "Vouch";
  const role = profile?.onboarded ? (profile.role as Role) : null;
  const items: NavItem[] = [["/jobs", "Browse jobs"], ...(role ? links[role] : [])];
  return (
    <header className="border-border/70 bg-background/80 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Logo name={appName} />
        {profile ? (
          <NavLinks
            items={items}
            pinned={
              <AccountMenu
                name={user?.name ?? null}
                email={profile.email}
                roleLabel={role ? roleLabels[role] : "New account"}
                links={
                  role ? accountLinks[role] : [{ href: "/onboarding", label: "Finish setting up", icon: <UserRound /> }]
                }
              />
            }
          />
        ) : (
          <NavLinks
            items={items}
            account={
              <>
                <Link href="/login" className={buttonClasses("ghost", "sm")}>
                  Log in
                </Link>
                <Link href="/signup" className={buttonClasses("default", "sm")}>
                  Sign up free
                </Link>
              </>
            }
          />
        )}
      </div>
    </header>
  );
}
