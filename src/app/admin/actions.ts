"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { audit } from "@/lib/server/context";
import { scheduleJobMatching } from "@/lib/server/background";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { parseJobText } from "@/lib/parsing/job";
import { AiUnavailableError } from "@/lib/parsing/claude";
import { findSimilarJobs, insertSourcedJob, parseSourcedForm } from "@/lib/jobs/sourced";
import { sanitizeText } from "@/lib/security/sanitize";
import type { SaveState } from "@/lib/job-values";
import type { ExtractState } from "@/app/recruiter/actions";

const go = (path: string, key: "ok" | "error", msg: string): never =>
  redirect(`${path}?${key}=${encodeURIComponent(msg)}`);

export async function setUserStatus(formData: FormData) {
  const { user } = await requireRole("admin");
  const target = String(formData.get("user_id") ?? "");
  const status = formData.get("status") === "suspended" ? "suspended" : "active";
  if (target === user.id) go("/admin/users", "error", "You can't suspend yourself.");
  // users.status is protected from API roles; the trusted backend changes it after the admin check above.
  await getPool().query("update public.users set status = $2 where id = $1 and role <> 'admin'", [target, status]);
  await audit(user.id, "admin", `admin.user_${status === "suspended" ? "suspended" : "reactivated"}`, "users", target);
  go("/admin/users", "ok", `User ${status}.`);
}

export async function moderateJob(formData: FormData) {
  const { supabase, user } = await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["removed", "published", "paused"].includes(status)) go("/admin/jobs", "error", "Invalid status.");
  const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
  if (error) go("/admin/jobs", "error", error.message);
  await audit(user.id, "admin", "admin.job_moderated", "jobs", id, {
    status,
    reason: sanitizeText(String(formData.get("reason") ?? ""), 500),
  });
  if (status === "published") scheduleJobMatching(id);
  go("/admin/jobs", "ok", `Job ${status}.`);
}

export async function extractSourcedJob(_prev: ExtractState, formData: FormData): Promise<ExtractState> {
  const { user } = await requireRole("admin");
  if (!(await checkRateLimit(getPool(), "parse", user.id))) return { error: "Too many extractions. Try again later." };
  const text = sanitizeText(String(formData.get("raw") ?? ""), 30000);
  if (text.length < 40) return { error: "Paste the full job posting text." };
  try {
    return { parsed: await parseJobText(text) };
  } catch (e) {
    return {
      error:
        e instanceof AiUnavailableError
          ? "Automatic extraction is unavailable — please fill in the form."
          : "Couldn't extract fields.",
    };
  }
}

export async function saveSourcedJob(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const { supabase, user } = await requireRole("admin");
  const p = parseSourcedForm(formData);
  if (!p.ok) return p.state;
  const j = p.job;
  // Duplicate detection: title + company + location + text similarity.
  if (formData.get("allow_duplicate") !== "on") {
    const d = await findSimilarJobs(j, null);
    if (d?.length) return { error: "This looks like a duplicate.", duplicates: d };
  }
  const publish = formData.get("intent") === "publish";
  const { id, error } = await insertSourcedJob(supabase, j, { ownerWorkspaceId: null, origin: "manual", publish });
  if (error || !id) return { error: error ?? "Could not save." };
  await audit(user.id, "admin", "admin.sourced_job_created", "jobs", id, {
    source_name: j.source_name,
    source_url: j.source_url,
  });
  if (publish) scheduleJobMatching(id);
  revalidatePath("/admin/jobs");
  return go("/admin/jobs", "ok", publish ? "Sourced job published." : "Sourced job saved as draft.");
}

/** Approve a recruiter's request to put their sourced job on the public board. */
export async function approvePublicJob(formData: FormData) {
  const { supabase, user } = await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  const approve = formData.get("decision") !== "reject";
  const { error } = await supabase
    .from("jobs")
    .update(approve ? { visibility: "public", public_requested_at: null } : { public_requested_at: null })
    .eq("id", id);
  if (error) go("/admin/jobs", "error", error.message);
  await audit(user.id, "admin", approve ? "admin.job_made_public" : "admin.job_public_declined", "jobs", id);
  if (approve) scheduleJobMatching(id);
  go("/admin/jobs", "ok", approve ? "Job is now on the public board." : "Request declined.");
}

export async function resolveTakedown(formData: FormData) {
  const { supabase, user } = await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  const decision = formData.get("decision") === "reject" ? "rejected" : "resolved";
  const note = sanitizeText(String(formData.get("note") ?? ""), 1000) || null;
  const { data: req } = await supabase.from("takedown_requests").select("job_id").eq("id", id).single();
  if (decision === "resolved" && req?.job_id) {
    const { error } = await supabase.from("jobs").update({ status: "removed" }).eq("id", req.job_id);
    if (error) go("/admin/takedowns", "error", error.message);
  }
  const { error } = await supabase
    .from("takedown_requests")
    .update({ status: decision, resolved_at: new Date().toISOString(), resolved_by: user.id, resolution_note: note })
    .eq("id", id);
  if (error) go("/admin/takedowns", "error", error.message);
  go("/admin/takedowns", "ok", decision === "resolved" ? "Listing removed and request resolved." : "Request rejected.");
}

export async function readFeedback(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("feedback_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  redirect(`/admin/feedback?id=${encodeURIComponent(id)}&reason=${encodeURIComponent(reason)}`);
}
