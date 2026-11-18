import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Job picture (D-036) through a short-lived signed URL. Anyone may see it when
 * the job is on the public board and the uploader marked it as free of
 * personal contacts; otherwise signed-in users (public jobs) and members of
 * the job's workspace only.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const r = await getPool().query<{ image_path: string | null; image_public: boolean; live: boolean }>(
    `select image_path, image_public,
            (visibility = 'public' and status = 'published' and (expires_at is null or expires_at > now())) live
     from public.jobs where id = $1`,
    [id],
  );
  const job = r.rows[0];
  if (!job?.image_path) return new NextResponse("Not found", { status: 404 });
  let allowed = job.live && job.image_public;
  if (!allowed) {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    if (claims?.claims?.sub) {
      // RLS: returns the row for public jobs and for the caller's own workspace jobs
      const { data } = await supabase.from("jobs").select("id").eq("id", id).maybeSingle();
      allowed = !!data;
    }
  }
  if (!allowed) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await createServiceClient().storage.from("job-images").createSignedUrl(job.image_path, 3600);
  if (error || !data) return new NextResponse("Unavailable", { status: 503 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });
}
