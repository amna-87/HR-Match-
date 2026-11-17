import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { verifyOptOut } from "@/lib/outreach/message";

export const dynamic = "force-dynamic";

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) for outreach email. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const hash = verifyOptOut((await params).token);
  if (!hash) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await getPool().query("select public.suppress_contact($1, 'opt_out')", [hash]);
  return NextResponse.json({ ok: true });
}
