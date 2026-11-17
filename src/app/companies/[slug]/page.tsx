import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Globe } from "lucide-react";
import { getPool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { JobList, PUBLIC_JOB_COLUMNS, type PublicJob } from "@/components/job-list";
import { CompanyAvatar } from "@/components/company-avatar";
import { siteUrl, slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

type Co = {
  name: string;
  website: string | null;
  description: string | null;
  location: string | null;
  id: string | null;
};

/** A company known by name: a company workspace, or the hiring company named on sourced jobs. */
async function findCompany(slug: string): Promise<Co | null> {
  const r = await getPool().query<Co>(
    `select co.id, co.name, co.website, co.description, co.location from public.companies co
     where co.kind = 'company' and co.status = 'active' and public.slugify(co.name) = $1
     union all
     select null, j.source_company_name, null, null, null from public.jobs j
     where j.source_company_name is not null and public.slugify(j.source_company_name) = $1
       and j.visibility = 'public' and j.status = 'published'
     limit 1`,
    [slug],
  );
  return r.rows[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await findCompany(slugify((await params).slug));
  if (!c) return {};
  return {
    title: `Jobs at ${c.name}`,
    description: `Open roles at ${c.name} on Vouch.`,
    alternates: { canonical: `${siteUrl()}/companies/${slugify(c.name)}` },
  };
}

/** Company page listing its open jobs (7c), when the company is known. */
export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = slugify((await params).slug);
  const c = await findCompany(slug);
  if (!c) notFound();
  const { supabase } = await getSession();
  let q = supabase!
    .from("jobs")
    .select(PUBLIC_JOB_COLUMNS)
    .eq("status", "published")
    .eq("visibility", "public")
    .order("published_at", { ascending: false })
    .limit(200);
  q = c.id
    ? q.or(`company_id.eq.${c.id},source_company_name.eq.${c.name.replace(/[,()]/g, " ")}`)
    : q.eq("source_company_name", c.name);
  const { data } = await q;
  const jobs = (data ?? []) as PublicJob[];
  return (
    <div className="space-y-6">
      <Link href="/jobs" className="text-muted-foreground text-sm underline">
        All jobs
      </Link>
      <header className="border-border bg-card flex flex-wrap items-center gap-5 rounded-3xl border p-6 sm:p-8">
        <CompanyAvatar name={c.name} size="lg" />
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{c.name}</h1>
          <p className="text-muted-foreground">
            {jobs.length} open role{jobs.length === 1 ? "" : "s"}
            {c.location ? ` · ${c.location}` : ""}
          </p>
          {c.website && (
            <a
              href={c.website}
              rel="noopener noreferrer nofollow"
              target="_blank"
              className="text-primary inline-flex items-center gap-1 text-sm underline"
            >
              <Globe className="h-4 w-4" aria-hidden /> Website
            </a>
          )}
        </div>
        {c.description && <p className="text-muted-foreground w-full text-sm">{c.description}</p>}
      </header>
      <JobList jobs={jobs} empty="No open roles right now." />
    </div>
  );
}
