"use server";
// Job sources (B2, D-029): CSV import and company career feeds. Writes go
// through the recruiter's client (RLS) except the feed fetcher (trusted).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRecruiter } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sanitizeLine } from "@/lib/security/sanitize";
import { findSimilarJobs, insertSourcedJob, parseSourcedForm } from "@/lib/jobs/sourced";
import { CSV_MAX_ROWS, type CsvField } from "@/lib/csv";
import { FEED_CONNECTORS } from "@/lib/connectors";
import { syncFeed, type FeedRow } from "@/lib/connectors/sync";
import { feedDeps } from "@/lib/connectors/server";
import { audit } from "@/lib/server/context";
import { scheduleJobMatching } from "@/lib/server/background";

const go = (key: "ok" | "error", msg: string): never =>
  redirect(`/recruiter/sources?${key}=${encodeURIComponent(msg)}`);

export type CsvRowResult = { row: number; title: string; status: "added" | "duplicate" | "error"; message?: string };
export type CsvImportResult = { error?: string; results?: CsvRowResult[] };

const pick = (r: Partial<Record<CsvField, string>>, k: CsvField) => (r[k] ?? "").trim();

function normalizeMode(s: string) {
  const t = s.toLowerCase();
  return /remote|wfh|home/.test(t) ? "remote" : /hybrid/.test(t) ? "hybrid" : "onsite";
}
function normalizeType(s: string) {
  const t = s.toLowerCase();
  if (/intern/.test(t)) return "internship";
  if (/part/.test(t)) return "part_time";
  if (/contract/.test(t)) return "contract";
  if (/temp/.test(t)) return "temporary";
  if (/freelance/.test(t)) return "freelance";
  return "full_time";
}

/** Import mapped CSV rows as jobs in the recruiter's workspace. Each row is validated on its own. */
export async function importCsvJobs(
  rows: Partial<Record<CsvField, string>>[],
  publish: boolean,
  allowDuplicates: boolean,
  publicBoard = false,
): Promise<CsvImportResult> {
  const { supabase, company, user, profile } = await requireRecruiter();
  const toPublic = publicBoard && profile.role === "admin";
  if (!company) return { error: "Set up your workspace first." };
  if (!Array.isArray(rows) || !rows.length) return { error: "The file has no rows." };
  if (rows.length > CSV_MAX_ROWS) return { error: `Import at most ${CSV_MAX_ROWS} rows at a time.` };
  if (!(await checkRateLimit(getPool(), "csvImport", user.id)))
    return { error: "Too many imports in the last hour. Try again later." };
  const results: CsvRowResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? {};
    const title = sanitizeLine(pick(r, "title"), 200);
    const email = pick(r, "apply_email");
    const wa = pick(r, "apply_whatsapp");
    const phone = pick(r, "apply_phone");
    const link = pick(r, "apply_link");
    const [method, target] = email
      ? ["email", email]
      : wa
        ? ["whatsapp", wa]
        : phone
          ? ["phone", phone]
          : link
            ? ["link", link]
            : ["link", ""];
    const fd = new FormData();
    const set = (k: string, v: string) => fd.set(k, v);
    set("title", title);
    set("description_summary", pick(r, "description").slice(0, 1500));
    set("required_skills", pick(r, "skills"));
    set("location", pick(r, "location"));
    set("work_mode", normalizeMode(pick(r, "work_mode")));
    set("employment_type", normalizeType(pick(r, "employment_type")));
    set("min_exp", (pick(r, "min_exp").match(/\d{1,2}/) ?? [""])[0]);
    set("source_name", pick(r, "source"));
    set("source_company_name", pick(r, "company"));
    set("apply_method", method);
    set("apply_target", target);
    const p = parseSourcedForm(fd);
    if (!p.ok) {
      results.push({ row: i + 2, title: title || "(no title)", status: "error", message: p.state.error });
      continue;
    }
    if (!allowDuplicates) {
      const d = await findSimilarJobs(p.job, company.id);
      if (d?.length) {
        results.push({ row: i + 2, title, status: "duplicate", message: `already listed: ${d[0].title}` });
        continue;
      }
    }
    const ins = await insertSourcedJob(supabase, p.job, {
      ownerWorkspaceId: company.id,
      origin: "csv_import",
      publish,
      publicBoard: toPublic,
    });
    if (ins.id && publish && toPublic) scheduleJobMatching(ins.id);
    results.push(
      ins.error ? { row: i + 2, title, status: "error", message: ins.error } : { row: i + 2, title, status: "added" },
    );
  }
  await audit(user.id, "recruiter", "workspace.csv_import", "companies", company.id, {
    rows: rows.length,
    added: results.filter((r) => r.status === "added").length,
  });
  revalidatePath("/recruiter");
  return { results };
}

export async function addFeed(formData: FormData) {
  const { supabase, company, user } = await requireRecruiter();
  if (!company) go("error", "Set up your workspace first.");
  const provider = String(formData.get("provider") ?? "") as keyof typeof FEED_CONNECTORS;
  const connector = FEED_CONNECTORS[provider];
  if (!connector) go("error", "Choose a supported job board.");
  const board = connector.parseBoard(String(formData.get("board") ?? ""));
  if (!board) go("error", `Enter the board name or careers URL (${connector.boardHint}).`);
  const name = sanitizeLine(String(formData.get("company_name") ?? ""), 200);
  if (!name) go("error", "Enter the company name.");
  if (!(await checkRateLimit(getPool(), "feedRun", user.id))) go("error", "Too many feed fetches. Try again later.");
  const { data: id, error } = await supabase.rpc("add_job_feed", {
    p_workspace_id: company!.id,
    p_provider: provider,
    p_board: board,
    p_company_name: name,
  });
  if (error || !id)
    go(
      "error",
      error?.message.includes("duplicate")
        ? "That feed is already connected."
        : (error?.message ?? "Could not add the feed."),
    );
  const res = await syncFeed(feedDeps(), {
    id: id as string,
    workspace_id: company!.id,
    provider,
    board: board!,
    company_name: name,
  });
  revalidatePath("/recruiter");
  if (res.error) go("error", `Feed added, but the first fetch failed: ${res.error}`);
  go(
    "ok",
    `Connected. ${res.added} job${res.added === 1 ? "" : "s"} added${res.duplicates ? `, ${res.duplicates} already listed` : ""}.`,
  );
}

export async function runFeedNow(formData: FormData) {
  const { supabase, user } = await requireRecruiter();
  if (!(await checkRateLimit(getPool(), "feedRun", user.id))) go("error", "Too many feed fetches. Try again later.");
  const { data: feed } = await supabase
    .from("job_feeds")
    .select("id, workspace_id, provider, board, company_name")
    .eq("id", String(formData.get("id") ?? ""))
    .maybeSingle();
  if (!feed) go("error", "Feed not found.");
  const res = await syncFeed(feedDeps(), feed as FeedRow);
  revalidatePath("/recruiter");
  if (res.error) go("error", `Fetch failed: ${res.error}`);
  go(
    "ok",
    `Fetched ${res.fetched}: ${res.added} new, ${res.updated} still open, ${res.closed} closed${res.duplicates ? `, ${res.duplicates} already listed` : ""}.`,
  );
}

export async function toggleFeed(formData: FormData) {
  const { supabase } = await requireRecruiter();
  const { error } = await supabase
    .from("job_feeds")
    .update({ active: formData.get("active") === "true" })
    .eq("id", String(formData.get("id") ?? ""));
  if (error) go("error", error.message);
  go("ok", "Feed updated.");
}

export async function deleteFeed(formData: FormData) {
  const { supabase, user } = await requireRecruiter();
  const id = String(formData.get("id") ?? "");
  // close its jobs first (they keep their history), then remove the feed
  await getPool().query(
    `update public.jobs set status = 'closed' where feed_id = $1 and status in ('published','paused','draft')
       and exists (select 1 from public.job_feeds f join public.company_members m on m.company_id = f.workspace_id
                   where f.id = $1 and m.user_id = $2)`,
    [id, user.id],
  );
  const { error } = await supabase.from("job_feeds").delete().eq("id", id);
  if (error) go("error", error.message);
  revalidatePath("/recruiter");
  go("ok", "Feed removed and its jobs closed.");
}

/** Create or reset the workspace's forward-by-email inbox (D-037). */
export async function resetInbox() {
  const { supabase, company } = await requireRecruiter();
  if (!company) go("error", "Set up your workspace first.");
  const { error } = await supabase.rpc("reset_job_inbox", { p_workspace_id: company!.id });
  if (error) go("error", error.message);
  go("ok", "Your job inbox address is ready. Any old address has stopped working.");
}
