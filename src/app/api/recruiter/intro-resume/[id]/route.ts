import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { audit } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/** Resume of an accepted introduction: short-lived signed URL for the requesting workspace only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { data: path } = await supabase.rpc("introduced_resume_path", { p_id: id });
  if (!path) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: signed, error } = await createServiceClient()
    .storage.from("resumes")
    .createSignedUrl(path as string, 60);
  if (error || !signed) return NextResponse.json({ error: "unavailable" }, { status: 500 });
  await audit(user.id, "recruiter", "intro.resume_viewed", "intro_requests", id);
  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
