import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/session";
import { OutreachTool } from "@/components/outreach-tool";
import { buildMessage, DEFAULT_INTRO, type OutreachJob } from "@/lib/outreach/message";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Send this opportunity" };

export default async function OutreachPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, company, user } = await requireRecruiter();
  if (!company) redirect("/recruiter");
  const ids = [sp.pool_ids ?? []]
    .flat()
    .filter((x) => /^[0-9a-f-]{36}$/i.test(x))
    .slice(0, 200);
  if (!ids.length) redirect(`/recruiter/jobs/${id}?error=${encodeURIComponent("Select at least one person first.")}`);
  const [{ data: job }, { data: people }] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, title, location, description_summary, source_type, source_company_name, apply_method, apply_target, visibility, status, public_number, company:companies!jobs_company_id_fkey(name, kind)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("pool_candidates").select("id, full_name").in("id", ids),
  ]);
  if (!job) notFound();
  const co = job.company as unknown as { name: string; kind: string } | null;
  const oj: OutreachJob = {
    id: job.id,
    title: job.title,
    company: (co?.kind === "company" ? co.name : null) ?? job.source_company_name,
    location: job.location,
    summary: job.description_summary,
    sourceType: job.source_type,
    applyMethod: job.apply_method,
    applyTarget: job.apply_target,
    isPublic: job.visibility === "public" && job.status === "published",
    publicNumber: job.public_number,
  };
  const preview = buildMessage({
    job: oj,
    personName: people?.[0]?.full_name ?? "Sam",
    recruiterName: user.name || user.email || "A recruiter",
    workspaceName: company.name,
    intro: DEFAULT_INTRO,
    optOut: "(a personal opt-out link)",
  }).text;
  return (
    <div className="space-y-6">
      <Link href={`/recruiter/jobs/${id}`} className="text-sm underline">
        ← {job.title}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Send this opportunity</CardTitle>
          <CardDescription>
            To {people?.length ?? 0} {people?.length === 1 ? "person" : "people"} from your talent pool:{" "}
            {(people ?? []).map((p) => p.full_name || "Unnamed profile").join(", ")}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OutreachTool
            jobId={id}
            jobTitle={job.title}
            people={(people ?? []).map((p) => ({ id: p.id, name: p.full_name || "Unnamed profile" }))}
            defaultIntro={DEFAULT_INTRO}
            preview={preview}
            emailEnabled={process.env.OUTREACH_EMAIL_ENABLED === "true"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
