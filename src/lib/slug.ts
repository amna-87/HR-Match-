// Readable public URLs (7c). Same rule as public.slugify() in the database.
export function slugify(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function cityOf(location: string | null | undefined): string {
  if (!location) return "";
  if (/remote/i.test(location)) return "remote";
  return slugify(location.split(/[,(|/]/)[0]);
}

/** /jobs/social-media-marketer-lahore-4821 */
export function jobPath(j: {
  id?: string;
  title: string;
  location?: string | null;
  public_number?: number | string | null;
}) {
  if (j.public_number == null) return `/jobs/${j.id}`;
  const base = [slugify(j.title).slice(0, 50), cityOf(j.location)].filter(Boolean).join("-");
  return `/jobs/${base ? `${base}-` : ""}${j.public_number}`;
}

export type JobParam = { kind: "uuid"; id: string } | { kind: "number"; n: number } | { kind: "slug"; slug: string };

export function parseJobParam(p: string): JobParam {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p)) return { kind: "uuid", id: p };
  const m = p.match(/(?:^|-)(\d{3,12})$/);
  if (m) return { kind: "number", n: Number(m[1]) };
  return { kind: "slug", slug: slugify(p) };
}

export const siteUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
