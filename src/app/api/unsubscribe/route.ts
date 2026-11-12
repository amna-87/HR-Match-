import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/consent/tokens";
import { getPool } from "@/lib/db";

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post). Mail clients POST here.
export async function POST(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const v = verifyToken(token, ["unsubscribe"]);
  if (!v.ok) return NextResponse.json({ ok: false }, { status: 400 });
  await getPool().query("select public.unsubscribe_candidate($1)", [v.payload.c]);
  return NextResponse.json({ ok: true });
}
