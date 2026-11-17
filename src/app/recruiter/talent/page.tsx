import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/session";
import { uploadTalentResumes } from "./actions";
import { engineDeps } from "@/lib/server/context";
import { prepareJobForRanking } from "@/lib/matching/engine";
import { scoreMatch } from "@/lib/matching/scoring";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Checkbox } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/flash";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Talent pool" };

type PoolRow = {
  candidate_id: string;
  is_own: boolean;
  similarity: number;
  full_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  headline: string | null;
  location: string | null;
  experience_years: number;
  skills: string[];
  uploaded_at: string;
};

export default async function TalentPoolPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, company } = await requireRecruiter();
  if (!company) redirect("/recruiter");

  const [{ data: uploads }, { data: jobs }] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, full_name, headline, contact_email, location, experience_years, created_at")
      .eq("uploaded_by_company_id", company.id)
      .eq("claim_status", "unclaimed")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("jobs")
      .select("id, title, status")
      .eq("company_id", company.id)
      .in("status", ["published", "draft", "paused"])
      .order("created_at", { ascending: false }),
  ]);

  // Ranked pool for one of our jobs (own uploads in full, others anonymous).
  const jobId = (jobs ?? []).some((j) => j.id === sp.job) ? sp.job : null;
  let ranked: (PoolRow & { score: number })[] = [];
  if (jobId) {
    const deps = engineDeps();
    const job = await prepareJobForRanking(deps, jobId);
    const { data } = await supabase.rpc("talent_pool_for_job", { p_job_id: jobId, p_limit: 50 });
    if (job) {
      ranked = ((data ?? []) as PoolRow[])
        .map((r) => ({
          ...r,
          score: scoreMatch(
            job,
            {
              id: r.candidate_id,
              experience_years: Number(r.experience_years) || 0,
              skills: r.skills.map((s) => ({ skill: s, source: "parsed" as const, domain: null })),
              optedInDomains: [],
            },
            Number(r.similarity),
            deps.embedder.name,
          ).score,
        }))
        .sort((a, b) => b.score - a.score);
    }
  }

  return (
    <div className="space-y-6">
      <Flash searchParams={sp} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Talent pool</h1>
        <p className="text-muted-foreground text-sm">
          Resumes you add are visible in full to your company only. Other companies see an anonymous card (headline,
          location, years of experience, skills) — never the name, contact details or file. We never email these people.
          If someone signs up with the same email, they can claim their profile and get matched to jobs, or delete it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add resumes</CardTitle>
          <CardDescription>PDF or DOCX, up to 10 files and about 4 MB in total per upload.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={uploadTalentResumes} className="space-y-4">
            <Field label="Resume files" htmlFor="resumes">
              <Input
                id="resumes"
                name="resumes"
                type="file"
                multiple
                required
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              />
            </Field>
            <Checkbox
              name="lawful_basis"
              required
              label="These people gave us their resume for job opportunities, and we may share it with Vouch."
            />
            <SubmitButton>Upload</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Find people for a job</CardTitle>
          <CardDescription>Ranks everyone in the talent pool against one of your jobs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(jobs ?? []).length ? (
            <form method="get" className="flex flex-wrap items-end gap-2">
              <Field label="Job" htmlFor="job">
                <Select id="job" name="job" defaultValue={jobId ?? ""}>
                  {(jobs ?? []).map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({j.status})
                    </option>
                  ))}
                </Select>
              </Field>
              <SubmitButton variant="outline">Rank</SubmitButton>
            </form>
          ) : (
            <p className="text-muted-foreground text-sm">
              <Link href="/recruiter/jobs/new" className="underline">
                Post a job
              </Link>{" "}
              to rank the pool against it.
            </p>
          )}
          {jobId && !ranked.length && <p className="text-muted-foreground text-sm">No profiles in the pool yet.</p>}
          {ranked.length > 0 && (
            <ul className="divide-border divide-y">
              {ranked.map((r) => (
                <li key={r.candidate_id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      {r.is_own ? (
                        <Link href={`/recruiter/talent/${r.candidate_id}`} className="hover:underline">
                          {r.full_name || "Unnamed profile"}
                        </Link>
                      ) : (
                        <span>Anonymous profile</span>
                      )}{" "}
                      {r.is_own ? <Badge tone="info">Your upload</Badge> : <Badge>Another company&apos;s upload</Badge>}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {[r.headline, r.location, `${Number(r.experience_years) || 0} yrs`].filter(Boolean).join(" · ")}
                    </p>
                    {r.is_own && (r.contact_email || r.contact_phone) && (
                      <p className="text-sm">{[r.contact_email, r.contact_phone].filter(Boolean).join(" · ")}</p>
                    )}
                    <p className="text-xs">{r.skills.slice(0, 12).join(", ")}</p>
                    {!r.is_own && (
                      <p className="text-muted-foreground text-xs">
                        Not on Vouch yet. If they join, they&apos;ll be matched to your job and can choose to apply.
                      </p>
                    )}
                  </div>
                  <Badge tone={r.score >= 70 ? "success" : "muted"}>{Math.round(r.score)}% fit</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your uploads ({uploads?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {uploads?.length ? (
            <ul className="divide-border divide-y text-sm">
              {uploads.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/recruiter/talent/${u.id}`} className="font-medium hover:underline">
                      {u.full_name || "Unnamed profile"}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}
                      · {[u.headline, u.location, u.contact_email ?? "no email"].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">added {formatDate(u.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No resumes uploaded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
