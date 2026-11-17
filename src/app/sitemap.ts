import type { MetadataRoute } from "next";
import { getPool } from "@/lib/db";
import { jobPath, siteUrl, slugify } from "@/lib/slug";
import { landingCounts } from "@/lib/jobs/categories";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/** Live public jobs, landing pages with enough jobs, company pages and static pages (7c). No contacts. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const staticPages = [
    "",
    "/jobs",
    "/about",
    "/how-matching-works",
    "/for-recruiters",
    "/terms",
    "/privacy",
    "/takedown",
  ].map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.5 }));
  let jobs: {
    title: string;
    location: string | null;
    public_number: number;
    domains: string[] | null;
    updated_at: string;
    company: string | null;
  }[] = [];
  try {
    jobs = (
      await getPool().query(
        `select j.title, j.location, j.public_number, j.domains, j.updated_at, co.name company
         from public.jobs j left join public.companies co on co.id = j.company_id and co.kind = 'company'
         where j.status = 'published' and j.visibility = 'public' and (j.expires_at is null or j.expires_at > now())
         order by j.published_at desc limit 45000`,
      )
    ).rows;
  } catch {
    return staticPages;
  }
  const counts = landingCounts(jobs);
  const companies = [...new Set(jobs.map((j) => j.company).filter(Boolean) as string[])];
  return [
    ...staticPages,
    ...jobs.map((j) => ({
      url: `${base}${jobPath(j)}`,
      lastModified: j.updated_at,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...counts.categories.map((c) => ({
      url: `${base}/jobs/${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...counts.cities.map((c) => ({ url: `${base}/jobs/${c.slug}`, changeFrequency: "daily" as const, priority: 0.6 })),
    ...counts.combos.map((c) => ({ url: `${base}/jobs/${c.path}`, changeFrequency: "daily" as const, priority: 0.5 })),
    ...companies.map((c) => ({
      url: `${base}/companies/${slugify(c)}`,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}
