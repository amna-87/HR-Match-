"use server";
// Network introductions (D-026, D-030). The full profile is released only after
// the person agrees; all rules are enforced in the database functions.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRecruiter } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sanitizeText } from "@/lib/security/sanitize";

const to = (path: string, key: "ok" | "error", msg: string): never => {
  const [base, hash] = path.split("#");
  return redirect(`${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}${hash ? `#${hash}` : ""}`);
};

export async function requestIntroduction(formData: FormData) {
  const { supabase, user } = await requireRecruiter();
  const jobId = String(formData.get("job_id") ?? "");
  const back = `/recruiter/jobs/${jobId}#network`;
  if (!(await checkRateLimit(getPool(), "intro", user.id)))
    to(back, "error", "You've asked for many introductions in the last day. Try again tomorrow.");
  const { error } = await supabase.rpc("request_introduction", {
    p_job_id: jobId,
    p_pool_candidate_id: String(formData.get("pool_candidate_id") ?? ""),
    p_message: sanitizeText(String(formData.get("message") ?? ""), 1000) || null,
  });
  if (error) to(back, "error", error.message);
  revalidatePath(`/recruiter/jobs/${jobId}`);
  to(back, "ok", "Introduction requested. We'll ask the person first; you'll see their details here if they agree.");
}

export async function withdrawIntroduction(formData: FormData) {
  const { supabase } = await requireRecruiter();
  const { error } = await supabase.rpc("withdraw_introduction", { p_id: String(formData.get("id") ?? "") });
  if (error) to("/recruiter/introductions", "error", error.message);
  to("/recruiter/introductions", "ok", "Request withdrawn.");
}

/** The uploading workspace records the person's answer (asked outside Vouch). */
export async function answerIntroAsOwner(formData: FormData) {
  const { supabase } = await requireRecruiter();
  const agreed = formData.get("decision") === "agreed";
  const { error } = await supabase.rpc("answer_introduction_as_owner", {
    p_id: String(formData.get("id") ?? ""),
    p_person_agreed: agreed,
    p_lawful_basis: formData.get("lawful_basis") === "on",
  });
  if (error) to("/recruiter/talent", "error", error.message);
  revalidatePath("/recruiter/talent");
  to(
    "/recruiter/talent",
    "ok",
    agreed ? "Thanks. The recruiter now sees the profile." : "Recorded: the person said no.",
  );
}
