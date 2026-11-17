import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeFor, type AppRole } from "./routes";

export interface SessionProfile {
  id: string;
  email: string;
  role: AppRole;
  status: "active" | "suspended";
  onboarded: boolean;
}

export interface SessionUser {
  id: string;
  email: string | undefined;
  /** display name given at sign-up (token claim user_metadata.full_name), if any */
  name: string | null;
}

/**
 * Current session, memoised per request (the header and the page share one lookup).
 * The access token is verified locally against the project's signing keys (getClaims),
 * so no network round trip to Supabase Auth; data access still goes through RLS.
 */
export const getSession = cache(async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { supabase: null, user: null, profile: null } as const;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const meta = (claims?.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const rawName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
  const user: SessionUser | null = claims?.sub
    ? { id: claims.sub, email: claims.email as string | undefined, name: rawName.trim().slice(0, 100) || null }
    : null;
  if (!user) return { supabase, user: null, profile: null } as const;
  const { data: profile } = await supabase
    .from("users")
    .select("id, email, role, status, onboarded")
    .eq("id", user.id)
    .single();
  return { supabase, user, profile: (profile as SessionProfile | null) ?? null } as const;
});

/** Server-side guard (middleware also enforces this; defense in depth). */
export async function requireRole(role: AppRole) {
  const s = await getSession();
  if (!s.supabase || !s.user || !s.profile) redirect("/login");
  if (s.profile.status !== "active") redirect("/login?error=account_unavailable");
  if (!s.profile.onboarded) redirect("/onboarding");
  if (s.profile.role !== role) redirect(homeFor(s.profile.role));
  return { supabase: s.supabase, user: s.user, profile: s.profile };
}

export async function requireCandidate() {
  const s = await requireRole("candidate");
  const { data: candidate } = await s.supabase.from("candidates").select("*").eq("user_id", s.user.id).single();
  if (!candidate) redirect("/onboarding");
  return { ...s, candidate };
}

export async function requireRecruiter() {
  const s = await requireRole("recruiter");
  const { data: memberships } = await s.supabase
    .from("company_members")
    .select("role, company:companies(*)")
    .eq("user_id", s.user.id);
  type Membership = { role: "admin" | "recruiter"; company: { id: string; name: string } & Record<string, unknown> };
  const list = (memberships ?? []) as unknown as Membership[];
  return { ...s, memberships: list, company: list[0]?.company ?? null, isCompanyAdmin: list[0]?.role === "admin" };
}
