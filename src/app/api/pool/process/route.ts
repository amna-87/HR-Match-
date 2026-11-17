import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { processPoolQueue } from "@/lib/pool/process";
import { poolDeps } from "@/lib/pool/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called repeatedly by the upload page while its files are queued. Processes
 * only the caller's workspace, within a time budget; the daily cron (and the
 * optional pg_cron schedule) picks up anything left if the page is closed.
 */
export async function POST() {
  const { supabase, user, profile } = await getSession();
  if (!supabase || !user || profile?.role !== "recruiter")
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { data: m } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).maybeSingle();
  if (!m) return NextResponse.json({ error: "no workspace" }, { status: 403 });
  const result = await processPoolQueue(poolDeps(), { workspaceId: m.company_id, budgetMs: 40_000 });
  const { data: files } = await supabase
    .from("pool_import_files")
    .select("id, storage_path, original_filename, status, error, pool_candidate_id")
    .eq("workspace_id", m.company_id)
    .order("created_at", { ascending: false })
    .limit(500);
  return NextResponse.json({ ...result, files: files ?? [] });
}
