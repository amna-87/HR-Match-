import type { Metadata } from "next";
import { LandingPage, landingTitle } from "../landing";
import { siteUrl, slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; city: string }>;
}): Promise<Metadata> {
  const { id, city } = await params;
  const title = await landingTitle(slugify(id), slugify(city));
  if (!title) return {};
  return {
    title,
    description: `${title} on Vouch. Browse and apply without an account.`,
    alternates: { canonical: `${siteUrl()}/jobs/${slugify(id)}/${slugify(city)}` },
  };
}

/** /jobs/<category>/<city>, e.g. /jobs/marketing/karachi */
export default async function CategoryCityPage({ params }: { params: Promise<{ id: string; city: string }> }) {
  const { id, city } = await params;
  return <LandingPage first={slugify(id)} second={slugify(city)} />;
}
