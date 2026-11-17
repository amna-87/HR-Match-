import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getPool } from "@/lib/db";
import { getEmailSender } from "@/lib/email/sender";
import { engineDeps } from "@/lib/server/context";
import { runScheduledTick } from "@/lib/server/cron";
import { poolDeps } from "@/lib/pool/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET" (see vercel.json).
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runScheduledTick(getPool(), engineDeps(), getEmailSender(), poolDeps());
  return NextResponse.json(result);
}
