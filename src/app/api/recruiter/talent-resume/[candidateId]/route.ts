import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { audit } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/** Talent-pool resume: short-lived signed URL, only for members of the owning workspace (checked under RLS). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { data: row } = await supabase
    .from("pool_candidates")
    .select("id, storage_path")
    .eq("id", candidateId)
    .maybeSingle();
  if (!row?.storage_path) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: signed, error } = await createServiceClient()
    .storage.from("resumes")
    .createSignedUrl(row.storage_path, 60);
  if (error || !signed) return NextResponse.json({ error: "unavailable" }, { status: 500 });
  await audit(user.id, "recruiter", "pool.resume_viewed", "pool_candidates", candidateId);
  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
