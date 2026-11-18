// Route -> role mapping used by middleware (and tested in tests/unit/routes.test.ts).
export type AppRole = "candidate" | "recruiter" | "admin";
export type RouteRequirement = AppRole | "any" | "onboarding" | null;

export function requiredRoleFor(pathname: string): RouteRequirement {
  if (pathname === "/candidate" || pathname.startsWith("/candidate/")) return "candidate";
  if (pathname === "/recruiter" || pathname.startsWith("/recruiter/")) return "recruiter";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/onboarding") return "onboarding";
  if (pathname === "/account" || pathname.startsWith("/account/")) return "any";
  return null;
}

export function homeFor(role: AppRole): string {
  return role === "admin" ? "/admin" : role === "recruiter" ? "/recruiter" : "/candidate";
}

/** Admins can use everything recruiters can (product-owner decision D-034). */
export function roleAllowed(required: AppRole, role: AppRole): boolean {
  return role === required || (required === "recruiter" && role === "admin");
}
