"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";

const back = (path: string, key: "ok" | "error", msg: string): never =>
  redirect(`${path}?${key}=${encodeURIComponent(msg)}`);

/** Save / unsave a job (needs login). */
export async function toggleSaveJob(formData: FormData) {
  const path = String(formData.get("path") ?? "/jobs");
  const { supabase, user } = await getSession();
  if (!supabase || !user) redirect(`/login?next=${encodeURIComponent(path)}`);
  const jobId = String(formData.get("job_id") ?? "");
  if (formData.get("saved") === "true")
    await supabase!.from("saved_jobs").delete().eq("job_id", jobId).eq("user_id", user!.id);
  else {
    const { error } = await supabase!.from("saved_jobs").insert({ job_id: jobId, user_id: user!.id });
    if (error && !/duplicate/.test(error.message)) back(path, "error", "Could not save this job.");
  }
  revalidatePath(path);
  back(path, "ok", formData.get("saved") === "true" ? "Removed from saved jobs." : "Saved. Find it on your dashboard.");
}

/** Apply through Vouch on an employer-posted job: the click is the consent (rule 1). */
export async function applyToJob(formData: FormData) {
  const path = String(formData.get("path") ?? "/jobs");
  const { supabase, user, profile } = await getSession();
  if (!supabase || !user) redirect(`/signup?role=candidate&next=${encodeURIComponent(path)}`);
  if (profile?.role !== "candidate") back(path, "error", "Only job seeker accounts can apply.");
  const { error } = await supabase!.rpc("apply_to_job", { p_job_id: String(formData.get("job_id") ?? "") });
  if (error) back(path, "error", error.message);
  revalidatePath("/candidate");
  back(path, "ok", "Applied. The employer now sees your profile; track it on your dashboard.");
}
