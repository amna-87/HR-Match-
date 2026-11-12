import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles email verification, password-reset and OAuth redirects (PKCE code exchange).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login?error=Link%20expired%20or%20invalid", url.origin));
  }
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/candidate";
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
