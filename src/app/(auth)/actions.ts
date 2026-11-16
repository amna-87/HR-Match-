"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPool } from "@/lib/db";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { requestMeta } from "@/lib/server/context";
import { homeFor, type AppRole } from "@/lib/auth/routes";
import { sanitizeLine } from "@/lib/security/sanitize";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const fail = (path: string, msg: string): never => redirect(`${path}?error=${encodeURIComponent(msg)}`);

/** Per account+IP (stops password guessing) and a looser per-IP cap (stops spraying many accounts). */
async function limited(email: string): Promise<boolean> {
  const { ip } = await requestMeta();
  const account = email.trim().toLowerCase().slice(0, 320);
  const perAccount = await checkRateLimit(getPool(), "auth", `${ip}:${account}`);
  const perIp = await checkRateLimit(getPool(), "authIp", ip);
  return !(perAccount && perIp);
}

const SignupSchema = z.object({
  email: z.email(),
  password: z.string().min(10, "Password must be at least 10 characters"),
  full_name: z.string().min(1).max(200),
  role: z.enum(["candidate", "recruiter"]),
  terms: z.literal("on", { message: "Please accept the Terms and Privacy Policy" }),
});

export async function signUp(formData: FormData) {
  if (await limited(String(formData.get("email") ?? "")))
    fail("/signup", "Too many attempts. Please wait a few minutes.");
  const parsed = SignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("/signup", parsed.error.issues[0]?.message ?? "Invalid input");
  const { email, password, full_name, role } = parsed.data!;
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role, full_name: sanitizeLine(full_name, 200), terms_accepted_at: new Date().toISOString() },
      emailRedirectTo: `${appUrl()}/auth/callback`,
    },
  });
  if (error) fail("/signup", error.message);
  redirect("/login?ok=" + encodeURIComponent("Check your inbox to verify your email, then log in."));
}

export async function logIn(formData: FormData) {
  const next = String(formData.get("next") ?? "");
  if (await limited(String(formData.get("email") ?? "")))
    fail("/login", "Too many attempts. Please wait a few minutes.");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) fail("/login", "Invalid email or password, or email not verified yet.");
  const { data: profile } = await supabase
    .from("users")
    .select("role, onboarded, status")
    .eq("id", data.user!.id)
    .single();
  if (profile?.status !== "active") {
    await supabase.auth.signOut();
    fail("/login", "This account is unavailable.");
  }
  if (!profile?.onboarded) redirect("/onboarding");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : homeFor(profile!.role as AppRole));
}

export async function logInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appUrl()}/auth/callback` },
  });
  if (error || !data.url) fail("/login", "Google sign-in is unavailable.");
  redirect(data.url!);
}

export async function requestPasswordReset(formData: FormData) {
  if (await limited(String(formData.get("email") ?? "")))
    fail("/forgot-password", "Too many attempts. Please wait a few minutes.");
  const email = String(formData.get("email") ?? "");
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl()}/auth/callback?next=/reset-password` });
  // Same response whether or not the account exists (no account enumeration).
  redirect("/forgot-password?ok=" + encodeURIComponent("If that account exists, we've emailed a reset link."));
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) fail("/reset-password", "Password must be at least 10 characters");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail("/reset-password", error.message);
  redirect("/login?ok=" + encodeURIComponent("Password updated."));
}

export async function chooseRole(formData: FormData) {
  const role = String(formData.get("role") ?? "");
  const full_name = sanitizeLine(String(formData.get("full_name") ?? ""), 200);
  if (formData.get("terms") !== "on") fail("/onboarding", "Please accept the Terms and Privacy Policy");
  const supabase = await createClient();
  const { error } = await supabase.rpc("choose_role", { p_role: role, p_full_name: full_name });
  if (error) fail("/onboarding", error.message);
  redirect(homeFor(role as AppRole));
}
