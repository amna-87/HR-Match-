// Category and location landing pages (7c), derived from real jobs. A page
// exists only when it has at least MIN_LANDING_JOBS open jobs.
import { cityOf, slugify } from "@/lib/slug";

export const MIN_LANDING_JOBS = 3;

export const CATEGORIES: { slug: string; label: string; match: RegExp }[] = [
  {
    slug: "marketing",
    label: "Marketing",
    match: /market|social media|seo|content|brand|advertis|digital|growth|copywrit|pr\b/,
  },
  { slug: "sales", label: "Sales", match: /sales|business development|account (manager|executive)|bdm|telesales/ },
  {
    slug: "engineering",
    label: "Engineering & IT",
    match: /engineer|developer|software|devops|data|it\b|qa\b|programmer|frontend|backend|full ?stack|web/,
  },
  {
    slug: "finance",
    label: "Finance & Accounting",
    match: /account|finance|financial|audit|tax|bookkeep|payroll|treasury/,
  },
  { slug: "design", label: "Design", match: /design|ux|ui\b|graphic|creative|illustrat|video edit/ },
  { slug: "hr", label: "HR & Recruiting", match: /\bhr\b|human resource|recruit|talent|people/ },
  { slug: "customer-service", label: "Customer Service", match: /customer|support|call cent|client service|success/ },
  {
    slug: "operations",
    label: "Operations & Admin",
    match: /operation|admin|logistic|supply|warehouse|procure|office|coordinator|assistant/,
  },
  { slug: "healthcare", label: "Healthcare", match: /nurse|doctor|medical|health|pharma|clinic/ },
  { slug: "education", label: "Education", match: /teacher|tutor|educat|lecturer|trainer|school/ },
];

export function categoryOf(j: { title: string; domains?: string[] | null }): string | null {
  const text = `${j.title} ${(j.domains ?? []).join(" ")}`.toLowerCase();
  return CATEGORIES.find((c) => c.match.test(text))?.slug ?? null;
}

export function categoryLabel(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? null;
}

export type LandingJob = { title: string; domains: string[] | null; location: string | null };

/** Counts for every category, city and category+city with enough jobs. */
export function landingCounts(jobs: LandingJob[]) {
  const cat = new Map<string, number>();
  const city = new Map<string, { n: number; label: string }>();
  const both = new Map<string, number>();
  for (const j of jobs) {
    const c = categoryOf(j);
    const l = cityOf(j.location);
    if (c) cat.set(c, (cat.get(c) ?? 0) + 1);
    if (l) {
      const label = l === "remote" ? "Remote" : (j.location ?? "").split(/[,(|/]/)[0].trim();
      city.set(l, { n: (city.get(l)?.n ?? 0) + 1, label: city.get(l)?.label ?? label });
    }
    if (c && l) both.set(`${c}/${l}`, (both.get(`${c}/${l}`) ?? 0) + 1);
  }
  const keep = <K>(m: Map<K, number>) => [...m].filter(([, n]) => n >= MIN_LANDING_JOBS);
  return {
    categories: keep(cat).map(([slug, n]) => ({ slug, n, label: categoryLabel(slug)! })),
    cities: [...city].filter(([, v]) => v.n >= MIN_LANDING_JOBS).map(([slug, v]) => ({ slug, n: v.n, label: v.label })),
    combos: keep(both).map(([k, n]) => ({ path: k, n })),
  };
}

export { slugify };
