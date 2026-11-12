import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobSourceBadge, workModeLabel } from "@/components/job-source";

export const metadata = { title: "Browse jobs" };
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const { supabase } = await getSession();
  const { data: jobs } = supabase
    ? await supabase
        .from("jobs")
        .select(
          "id, title, location, work_mode, source_type, source_name, source_company_name, description_summary, company:companies(name)",
        )
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(100)
    : { data: [] };
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Open roles</h1>
      <p className="text-muted-foreground text-sm">
        Listings marked <em>Sourced</em> were found on other sites and summarised by us — apply via the original
        listing.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {(jobs ?? []).map((j) => {
          const company =
            (j.company as unknown as { name: string } | null)?.name ?? j.source_company_name ?? "Employer";
          return (
            <Card key={j.id} className={j.source_type === "sourced" ? "border-dashed border-amber-400" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>
                    <Link href={`/jobs/${j.id}`} className="hover:underline">
                      {j.title}
                    </Link>
                  </CardTitle>
                  <JobSourceBadge job={j} />
                </div>
                <p className="text-muted-foreground text-sm">
                  {company} · {workModeLabel(j.work_mode)}
                  {j.location ? ` · ${j.location}` : ""}
                </p>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 text-sm">{j.description_summary}</p>
              </CardContent>
            </Card>
          );
        })}
        {!jobs?.length && <p className="text-muted-foreground">No open roles yet.</p>}
      </div>
    </div>
  );
}
