import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requiredRoleFor, homeFor, roleAllowed, type AppRole } from "@/lib/auth/routes";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const required = requiredRoleFor(request.nextUrl.pathname);
  if (!url || !anon) {
    // Not configured (e.g. health check in CI): allow public pages only.
    return required ? NextResponse.redirect(new URL("/login", request.url)) : response;
  }
  // Anonymous visitors on public pages: no session cookie, nothing to refresh or check.
  if (!required && !request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return response;
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (all) => {
        for (const { name, value } of all) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of all) response.cookies.set(name, value, options);
      },
    },
  });
  // Refreshes the session cookie if needed and verifies the token locally (ES256 signing keys).
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? { id: data.claims.sub } : null;

  if (!required) return response;
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  const { data: profile } = await supabase.from("users").select("role, status, onboarded").eq("id", user.id).single();
  if (!profile || profile.status !== "active") {
    return NextResponse.redirect(new URL("/login?error=account_unavailable", request.url));
  }
  if (!profile.onboarded && required !== "onboarding") {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }
  if (required === "onboarding") {
    return profile.onboarded ? NextResponse.redirect(new URL(homeFor(profile.role as AppRole), request.url)) : response;
  }
  if (required !== "any" && !roleAllowed(required, profile.role as AppRole)) {
    return NextResponse.redirect(new URL(homeFor(profile.role as AppRole), request.url));
  }
  return response;
}
