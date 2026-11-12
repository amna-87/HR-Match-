import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { deliveryStatusFor, verifySvixSignature } from "@/lib/email/webhook";

export const dynamic = "force-dynamic";

/** Delivery status tracking from Resend. */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const body = await req.text();
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const ok = verifySvixSignature(
    secret,
    {
      id: req.headers.get("svix-id") ?? "",
      timestamp: req.headers.get("svix-timestamp") ?? "",
      signature: req.headers.get("svix-signature") ?? "",
    },
    body,
  );
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  const event = JSON.parse(body) as { type: string; data?: { email_id?: string } };
  const status = deliveryStatusFor(event.type);
  if (status && event.data?.email_id) {
    await getPool().query("update public.notifications set delivery_status = $2 where provider_message_id = $1", [
      event.data.email_id,
      status,
    ]);
  }
  return NextResponse.json({ ok: true });
}
