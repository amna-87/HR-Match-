import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { IP_LIMITS, ipAllowed, rateLimitClass } from "@/lib/security/ip-limit";

export async function middleware(request: NextRequest) {
  const cls = rateLimitClass(request.nextUrl.pathname);
  if (cls) {
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    if (!ipAllowed(`${cls}:${ip}`, IP_LIMITS[cls]))
      return new NextResponse("Too many requests. Please slow down and try again in a minute.", {
        status: 429,
        headers: { "Retry-After": "60", "Content-Type": "text/plain; charset=utf-8" },
      });
  }
  return updateSession(request);
}

export const config = {
  // Node.js runtime: runs in the same region as the app functions (vercel.json "regions"),
  // next to the database, instead of at an edge location far from it.
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/cron|api/webhooks|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
