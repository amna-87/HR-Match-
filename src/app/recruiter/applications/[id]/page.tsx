import { notFound } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/session";
import { changeStage, submitFeedback } from "../../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { buttonClasses } from "@/components/ui/button";
import { Flash } from "@/components/flash";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STAGES = ["new", "reviewed", "interview", "offer", "hired", "rejected", "redirected"];

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const { supabase } = await requireRecruiter();
  const { data: app } = await supabase.from("applications").select("*, job:jobs(id, title), match:matches(score, explanation)").eq("id", id).maybeSingle();
  if (!app) notFound();
  const [{ data: c }, { data: skills }, { data: exps }, { data: edu }, { data: certs }, { data: history }, { data: feedback }] = await Promise.all([
    supabase.from("candidates").select("full_name, headline, summary, location, contact_email, contact_phone, availability, experience_years, languages").eq("id", app.candidate_id).maybeSingle(),
    supabase.from("candidate_skills").select("skill, source").eq("candidate_id", app.candidate_id),
    supabase.from("experiences").select("*").eq("candidate_id", app.candidate_id).order("position"),
    supabase.from("education").select("*").eq("candidate_id", app.candidate_id),
    supabase.from("certifications").select("*").eq("candidate_id", app.candidate_id),
    supabase.from("application_stage_history").select("from_stage, to_stage, changed_at").eq("application_id", id).order("changed_at"),
    supabase.from("interview_feedback").select("*").eq("application_id", id).maybeSingle(),
  ]);
  if (!c) notFound();
  const job = app.job as { id: string; title: string };
  const match = app.match as { score: number; explanation: string } | null;
  return (
    <div className="space-y-6">
      <Flash searchParams={await searchParams} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{c.full_name}</h1>
          <p className="text-muted-foreground">Applied to {job.title} on {formatDate(app.applied_at)}{match ? ` · score ${Math.round(Number(match.score))}` : ""}</p>
        </div>
        <a href={`/api/recruiter/resume/${app.id}`} className={buttonClasses("outline")} target="_blank" rel="noopener">Open resume</a>
      </div>
      {match && <p className="text-sm">{match.explanation}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{c.headline}</CardTitle>
            <CardDescription>{[c.location, `${c.experience_years} yrs`, c.availability, c.contact_email, c.contact_phone].filter(Boolean).join(" · ")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="whitespace-pre-line">{c.summary}</p>
            <div className="flex flex-wrap gap-1">
              {(skills ?? []).map((s) => <Badge key={s.skill + s.source} tone={s.source === "verified" ? "vetted" : "muted"}>{s.skill}</Badge>)}
            </div>
            <div className="space-y-3">
              {(exps ?? []).map((e) => (
                <div key={e.id}>
                  <p className="font-medium">{e.title}{e.company ? ` · ${e.company}` : ""}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(e.start_date)} – {e.is_current ? "present" : formatDate(e.end_date)}</p>
                  <p className="whitespace-pre-line">{e.description}</p>
                </div>
              ))}
            </div>
            {(edu ?? []).length > 0 && <p><strong>Education:</strong> {(edu ?? []).map((e) => [e.degree, e.field, e.institution].filter(Boolean).join(", ")).join("; ")}</p>}
            {(certs ?? []).length > 0 && <p><strong>Certifications:</strong> {(certs ?? []).map((x) => x.name).join(", ")}</p>}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Stage</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <form action={changeStage} className="flex gap-2">
                <input type="hidden" name="application_id" value={app.id} />
                <label htmlFor="stage" className="sr-only">Stage</label>
                <Select id="stage" name="stage" defaultValue={app.stage}>{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
                <SubmitButton variant="outline">Update</SubmitButton>
              </form>
              <ol className="space-y-1 text-xs text-muted-foreground">
                {(history ?? []).map((h, i) => <li key={i}>{formatDate(h.changed_at)}: {h.from_stage ?? "—"} → {h.to_stage}</li>)}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Interview feedback</CardTitle>
              <CardDescription>Growth areas and private notes stay inside your company.</CardDescription>
            </CardHeader>
            <CardContent>
              {feedback ? (
                <div className="space-y-1 text-sm">
                  <p><strong>Outcome:</strong> {feedback.outcome.replaceAll("_", " ")}</p>
                  <p><strong>Strengths:</strong> {feedback.strengths.join(", ") || "—"}</p>
                  <p><strong>Growth areas (internal):</strong> {feedback.growth_areas.join(", ") || "—"}</p>
                  <p><strong>Suggested domains:</strong> {feedback.suggested_domains.join(", ") || "—"}</p>
                  {feedback.rating && <p><strong>Rating:</strong> {feedback.rating}/5</p>}
                  {feedback.private_note && <p><strong>Private note (internal):</strong> {feedback.private_note}</p>}
                </div>
              ) : (
                <form action={submitFeedback} className="space-y-3">
                  <input type="hidden" name="application_id" value={app.id} />
                  <Field label="Outcome" htmlFor="outcome">
                    <Select id="outcome" name="outcome" required defaultValue="">
                      <option value="" disabled>Choose…</option>
                      <option value="not_a_fit">Not a fit</option>
                      <option value="good_fit_different_role">Good fit for a different role</option>
                    </Select>
                  </Field>
                  <Field label="Strengths (shared if candidate opts in)" htmlFor="strengths" hint="Comma separated, e.g. strong copywriting">
                    <Input id="strengths" name="strengths" />
                  </Field>
                  <Field label="Suggested roles / domains" htmlFor="suggested_domains" hint="Required for 'different role'">
                    <Input id="suggested_domains" name="suggested_domains" />
                  </Field>
                  <Field label="Growth areas (internal only)" htmlFor="growth_areas">
                    <Input id="growth_areas" name="growth_areas" />
                  </Field>
                  <Field label="Rating (optional)" htmlFor="rating">
                    <Select id="rating" name="rating" defaultValue=""><option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select>
                  </Field>
                  <Field label="Private note (internal only)" htmlFor="private_note">
                    <Textarea id="private_note" name="private_note" />
                  </Field>
                  <SubmitButton>Save feedback</SubmitButton>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
