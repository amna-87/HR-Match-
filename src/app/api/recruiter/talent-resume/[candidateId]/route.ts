import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { audit } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/** Talent-pool resume: short-lived signed URL, only for the company that uploaded it (checked under RLS). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  // RLS (resumes_uploader_select): visible only to the uploading company while unclaimed
  const { data: resume } = await supabase
    .from("resumes")
    .select("id, storage_path")
    .eq("candidate_id", candidateId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!resume) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: signed, error } = await createServiceClient()
    .storage.from("resumes")
    .createSignedUrl(resume.storage_path, 60);
  if (error || !signed) return NextResponse.json({ error: "unavailable" }, { status: 500 });
  await audit(user.id, "recruiter", "talent_pool.resume_viewed", "candidates", candidateId);
  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
