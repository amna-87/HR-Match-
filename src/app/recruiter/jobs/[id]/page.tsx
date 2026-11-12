import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/session";
import { extractJob, saveJob, setJobStatus, changeStage } from "../../actions";
import { JobEditor } from "@/components/job-editor";
import type { JobValues } from "@/lib/job-values";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";

const STAGES = ["new", "reviewed", "interview", "offer", "hired", "rejected", "redirected"] as const;

interface PipelineRow {
  match_id: string;
  candidate_id: string;
  application_id: string | null;
  status: string;
  score: number;
  explanation: string;
  consented: boolean;
  full_name: string | null;
  headline: string | null;
  location: string | null;
  availability: string | null;
  experience_years: number;
  skills: string[];
  vetted: boolean;
  vetted_strengths: string[];
  vetted_domains: string[];
  vetted_source_labels: string[];
  stage: string | null;
}

export default async function RecruiterJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireRecruiter();
  const { data: job } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
  if (!job || job.source_type !== "verified") notFound();
  const { data: rows } = await supabase.rpc("recruiter_job_matches", { p_job_id: id });
  const all = (rows ?? []) as PipelineRow[];

  const minScore = Number(sp.min_score ?? 0) || 0;
  const minExp = Number(sp.min_exp ?? 0) || 0;
  const loc = (sp.location ?? "").toLowerCase();
  const avail = (sp.availability ?? "").toLowerCase();
  const stage = sp.stage ?? "";
  const applicants = all
    .filter((r) => r.consented)
    .filter((r) => Number(r.score) >= minScore && Number(r.experience_years) >= minExp)
    .filter((r) => !loc || (r.location ?? "").toLowerCase().includes(loc))
    .filter((r) => !avail || (r.availability ?? "").toLowerCase().includes(avail))
    .filter((r) => !stage || r.stage === stage);
  const vetted = all.filter((r) => !r.consented && r.vetted);

  const values: JobValues = { ...job, location: job.location ?? "", salary_currency: job.salary_currency ?? "" };
  return (
    <div className="space-y-8">
      <Flash searchParams={sp} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {job.title} <Badge tone={job.status === "published" ? "success" : "muted"}>{job.status}</Badge>
        </h1>
        <div className="flex flex-wrap gap-2">
          {job.status !== "removed" &&
            (["published", "paused", "closed"] as const)
              .filter((s) => s !== job.status)
              .map((s) => (
                <form key={s} action={setJobStatus}>
                  <input type="hidden" name="id" value={job.id} />
                  <input type="hidden" name="status" value={s} />
                  <Button size="sm" variant={s === "published" ? "default" : "outline"}>
                    {s === "published" ? "Publish" : s === "paused" ? "Pause" : "Close"}
                  </Button>
                </form>
              ))}
        </div>
      </div>

      <section aria-labelledby="pipeline-h" className="space-y-3">
        <h2 id="pipeline-h" className="text-xl font-semibold">
          Applicants ({applicants.length})
        </h2>
        <p className="text-muted-foreground text-sm">
          Only candidates who approved this match appear here, ranked by match score.
        </p>
        <form className="border-border flex flex-wrap items-end gap-3 rounded-md border p-3" method="get">
          <Field label="Min score" htmlFor="min_score">
            <Input
              id="min_score"
              name="min_score"
              type="number"
              min={0}
              max={100}
              defaultValue={sp.min_score ?? ""}
              className="w-24"
            />
          </Field>
          <Field label="Location" htmlFor="location">
            <Input id="location" name="location" defaultValue={sp.location ?? ""} className="w-40" />
          </Field>
          <Field label="Min years" htmlFor="min_exp">
            <Input id="min_exp" name="min_exp" type="number" min={0} defaultValue={sp.min_exp ?? ""} className="w-24" />
          </Field>
          <Field label="Availability" htmlFor="availability">
            <Input id="availability" name="availability" defaultValue={sp.availability ?? ""} className="w-40" />
          </Field>
          <Field label="Stage" htmlFor="stage">
            <Select id="stage" name="stage" defaultValue={stage}>
              <option value="">Any</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
        <div className="space-y-3">
          {applicants.map((r) => (
            <Card key={r.match_id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-5">
                <div className="space-y-1">
                  <p className="font-medium">
                    {r.application_id ? (
                      <Link className="hover:underline" href={`/recruiter/applications/${r.application_id}`}>
                        {r.full_name ?? "Candidate"}
                      </Link>
                    ) : (
                      r.full_name
                    )}
                    {r.vetted && (
                      <Badge tone="vetted" className="ml-2">
                        Interview-vetted
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {[r.headline, r.location, `${r.experience_years} yrs`, r.availability].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-sm">{r.explanation}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="info">{Math.round(Number(r.score))}</Badge>
                  {r.application_id && (
                    <form action={changeStage} className="flex items-center gap-2">
                      <input type="hidden" name="application_id" value={r.application_id} />
                      <input type="hidden" name="back" value={`/recruiter/jobs/${job.id}`} />
                      <label htmlFor={`stage-${r.application_id}`} className="sr-only">
                        Stage
                      </label>
                      <Select
                        id={`stage-${r.application_id}`}
                        name="stage"
                        defaultValue={r.stage ?? "new"}
                        className="h-8 w-32"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                      <Button size="sm" variant="outline">
                        Update
                      </Button>
                    </form>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {!applicants.length && (
            <p className="text-muted-foreground text-sm">
              No applicants yet{job.status === "published" ? " — matched candidates are being asked." : "."}
            </p>
          )}
        </div>
      </section>

      {vetted.length > 0 && (
        <section aria-labelledby="vetted-h" className="space-y-3">
          <h2 id="vetted-h" className="text-xl font-semibold">
            Interview-vetted candidates in this area
          </h2>
          <p className="text-muted-foreground text-sm">
            These candidates were recommended by another recruiter and opted in to being visible for this domain. Names
            and contact details stay hidden; they&apos;ll be asked about your job and appear above if they approve.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {vetted.map((r) => (
              <Card key={r.match_id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {r.headline ?? "Candidate"} <Badge tone="vetted">Interview-vetted</Badge>
                  </CardTitle>
                  <CardDescription>
                    {[r.location, `${r.experience_years} yrs`].filter(Boolean).join(" · ")} · score{" "}
                    {Math.round(Number(r.score))}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>
                    <strong>Strengths:</strong> {r.vetted_strengths.join(", ") || "—"}
                  </p>
                  <p>
                    <strong>Recommended for:</strong> {r.vetted_domains.join(", ")} (by{" "}
                    {r.vetted_source_labels.join(", ")})
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="edit-h" className="space-y-3">
        <h2 id="edit-h" className="text-xl font-semibold">
          Edit job
        </h2>
        <JobEditor initial={values} mode="verified" extractAction={extractJob} saveAction={saveJob} />
      </section>
    </div>
  );
}
