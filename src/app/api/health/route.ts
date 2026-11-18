import { NextResponse } from "next/server";
import { extractResumeText } from "@/lib/parsing/extract-text";
import { minimalPdf } from "@/lib/parsing/sample-pdf";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let database: "ok" | "unconfigured" | "error" = "unconfigured";
  let reason: string | undefined;
  let schema: "ok" | "missing" | undefined;
  let missing: string[] | undefined;
  if (process.env.DATABASE_URL) {
    try {
      await getPool().query("select 1");
      database = "ok";
      const { rows } = await getPool().query<{ name: string; present: boolean }>(SCHEMA_CHECK);
      missing = rows.filter((r) => !r.present).map((r) => r.name);
      schema = missing.length ? "missing" : "ok";
    } catch (e) {
      database = "error";
      reason = describeDbError(e);
      console.error("[health] database check failed", e);
    }
  }
  // ?deep=1: also check that resume PDFs can be read on this server.
  let pdf: string | undefined;
  if (new URL(req.url).searchParams.get("deep") === "1") {
    try {
      const text = await extractResumeText("pdf", minimalPdf(["Vouch health check"]));
      pdf = text.includes("Vouch health check") ? "ok" : "unreadable";
    } catch (e) {
      pdf = `error: ${String((e as Error)?.message ?? e).slice(0, 160)}`;
      console.error("[health] pdf check failed", e);
    }
  }
  const status = database === "error" ? 503 : 200;
  return NextResponse.json(
    {
      status: status === 200 ? "ok" : "degraded",
      database,
      ...(schema ? { schema } : {}),
      ...(missing?.length ? { missing_migrations: missing } : {}),
      ...(reason ? { reason } : {}),
      ...(pdf ? { pdf } : {}),
      time: new Date().toISOString(),
    },
    { status },
  );
}

/** One marker object per migration, so a deploy can confirm the database is up to date. */
const SCHEMA_CHECK = `
  select name, present from (values
    ('000001_schema', to_regclass('public.matches') is not null),
    ('000002_helpers', exists (select 1 from pg_proc where proname = 'match_transition_allowed')),
    ('000003_rls', exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'matches')),
    ('000004_rpc', exists (select 1 from pg_proc where proname = 'respond_to_match')),
    ('000005_storage', exists (select 1 from storage.buckets where id = 'resumes')),
    ('000006_profile_rpc', exists (select 1 from pg_proc where proname = 'save_candidate_profile')),
    ('000007_apply_instructions_invitations', to_regclass('public.company_invitations') is not null
       and exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'jobs' and column_name = 'apply_instructions')),
    ('000008_talent_pool', exists (select 1 from pg_proc where proname = 'talent_pool_for_job')),
    ('000009_sourced_link_optional', exists (select 1 from pg_constraint
       where conname = 'jobs_sourced_shape' and pg_get_constraintdef(oid) like '%source_url IS NULL%')),
    ('000010_workspaces', exists (select 1 from pg_proc where proname = 'create_workspace')),
    ('000011_pool', to_regclass('public.pool_candidates') is not null),
    ('000012_job_sources', exists (select 1 from pg_proc where proname = 'confirm_job_open')),
    ('000013_job_feeds', to_regclass('public.job_feeds') is not null),
    ('000014_matching_intros', to_regclass('public.intro_requests') is not null),
    ('000015_outreach', to_regclass('public.suppression_list') is not null),
    ('000016_public_pages', to_regclass('public.saved_jobs') is not null),
    ('000017_export_v1_launch', exists (select 1 from pg_proc where proname = 'export_my_data_base')),
    ('000018_admin_recruiting', exists (select 1 from pg_proc where proname = 'create_workspace'
       and pg_get_functiondef(oid) like '%''recruiter'', ''admin''%')),
    ('000019_job_images', exists (select 1 from storage.buckets where id = 'job-images')),
    ('000020_more_feeds_inbox', to_regclass('public.job_inboxes') is not null),
    ('000021_feed_public', exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'job_feeds' and column_name = 'publish_public')),
    ('000022_search_feeds', exists (select 1 from pg_constraint
       where conname = 'job_feeds_provider_check' and pg_get_constraintdef(oid) like '%remotive%'))
  ) as t(name, present)`;

/** A short, non-secret category for setup troubleshooting (never the URL or password). */
function describeDbError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const code = err?.code ?? "";
  const msg = err?.message ?? "";
  if (code === "28P01" || /password authentication/i.test(msg)) return "wrong_password";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "host_not_found";
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || /timeout/i.test(msg)) return "cannot_connect";
  if (code === "3D000") return "database_not_found";
  if (/tenant or user not found/i.test(msg)) return "wrong_user_or_project";
  if (e instanceof TypeError || /invalid url/i.test(msg)) return "invalid_connection_string";
  if (/certificate|ssl|tls/i.test(msg)) return "ssl_error";
  return code ? `pg_${code}` : "unknown";
}
