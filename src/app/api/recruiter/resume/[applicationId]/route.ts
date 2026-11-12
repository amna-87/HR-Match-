import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { audit } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/**
 * Recruiter resume access: short-lived signed URL, only for candidates who
 * applied to one of the recruiter's company's jobs (checked under RLS first).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  // RLS: only returns the row if the caller's company owns the job
  const { data: app } = await supabase.from("applications").select("id, candidate_id").eq("id", applicationId).maybeSingle();
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: allowed } = await supabase.rpc("company_can_view_candidate", { p_candidate_id: app.candidate_id });
  if (!allowed) return NextResponse.json({ error: "not found" }, { status: 404 });

  const service = createServiceClient();
  const { data: resume } = await service
    .from("resumes")
    .select("storage_path")
    .eq("candidate_id", app.candidate_id)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!resume) return NextResponse.json({ error: "no resume on file" }, { status: 404 });
  const { data: signed, error } = await service.storage.from("resumes").createSignedUrl(resume.storage_path, 60);
  if (error || !signed) return NextResponse.json({ error: "unavailable" }, { status: 500 });
  await audit(user.id, "recruiter", "resume.viewed", "applications", app.id);
  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
