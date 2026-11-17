import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Node.js runtime: runs in the same region as the app functions (vercel.json "regions"),
  // next to the database, instead of at an edge location far from it.
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/cron|api/webhooks|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
