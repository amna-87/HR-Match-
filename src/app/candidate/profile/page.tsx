import { requireCandidate } from "@/lib/auth/session";
import { uploadResume, saveProfile } from "../actions";
import { ProfileForm } from "@/components/profile-form";
import type { ProfileInput } from "@/lib/profile-schema";
import type { ParsedResume } from "@/lib/parsing/schemas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, candidate } = await requireCandidate();
  const [{ data: skills }, { data: exps }, { data: edu }, { data: certs }, { data: resumes }] = await Promise.all([
    supabase
      .from("candidate_skills")
      .select("skill, source")
      .eq("candidate_id", candidate.id)
      .neq("source", "verified"),
    supabase.from("experiences").select("*").eq("candidate_id", candidate.id).order("position"),
    supabase.from("education").select("*").eq("candidate_id", candidate.id),
    supabase.from("certifications").select("*").eq("candidate_id", candidate.id),
    supabase
      .from("resumes")
      .select("id, original_filename, parse_status, parse_error, created_at, parsed_json, is_current")
      .eq("candidate_id", candidate.id)
      .order("created_at", { ascending: false }),
  ]);

  let initial: ProfileInput = {
    full_name: candidate.full_name ?? "",
    headline: candidate.headline ?? "",
    summary: candidate.summary ?? "",
    location: candidate.location ?? "",
    contact_email: candidate.contact_email ?? "",
    contact_phone: candidate.contact_phone ?? "",
    languages: candidate.languages ?? [],
    skills: (skills ?? []).map((s) => s.skill),
    experiences: (exps ?? []).map((e) => ({
      title: e.title,
      company: e.company ?? "",
      start_date: e.start_date ?? "",
      end_date: e.end_date ?? "",
      is_current: e.is_current,
      description: e.description ?? "",
    })),
    education: (edu ?? []).map((e) => ({
      institution: e.institution,
      degree: e.degree ?? "",
      field: e.field ?? "",
      start_date: e.start_date ?? "",
      end_date: e.end_date ?? "",
    })),
    certifications: (certs ?? []).map((c) => ({ name: c.name, issuer: c.issuer ?? "" })),
  };

  // Review step: pre-fill the form with what the AI extracted; nothing is saved until the candidate saves.
  const review = sp.review ? resumes?.find((r) => r.id === sp.review && r.parse_status === "succeeded") : null;
  if (review?.parsed_json) {
    const r = review.parsed_json as ParsedResume;
    initial = {
      full_name: r.full_name || initial.full_name,
      headline: r.headline || initial.headline,
      summary: r.summary || initial.summary,
      location: r.location || initial.location,
      contact_email: r.email || initial.contact_email,
      contact_phone: r.phone || initial.contact_phone,
      languages: r.languages.length ? r.languages : initial.languages,
      skills: r.skills.length ? r.skills : initial.skills,
      experiences: r.experiences.length ? r.experiences : initial.experiences,
      education: r.education.length ? r.education : initial.education,
      certifications: r.certifications.length ? r.certifications : initial.certifications,
    };
  }

  return (
    <div className="space-y-6">
      <Flash searchParams={sp} />
      <Card>
        <CardHeader>
          <CardTitle>Resume</CardTitle>
          <CardDescription>
            PDF or DOCX, up to 5 MB. Stored privately — employers only get access after you approve a match.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={uploadResume} className="flex flex-wrap items-center gap-3">
            <label htmlFor="resume" className="sr-only">
              Resume file
            </label>
            <input
              id="resume"
              name="resume"
              type="file"
              required
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="text-sm"
            />
            <SubmitButton pendingText="Uploading and reading…">Upload</SubmitButton>
          </form>
          <ul className="text-sm">
            {(resumes ?? []).slice(0, 3).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                {r.original_filename} · {formatDate(r.created_at)}
                <Badge
                  tone={r.parse_status === "succeeded" ? "success" : r.parse_status === "failed" ? "danger" : "muted"}
                >
                  {r.parse_status}
                </Badge>
                {r.is_current && <Badge>current</Badge>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {review && (
        <Alert tone="info">
          We pre-filled your profile from <strong>{review.original_filename}</strong>. Please review every field, fix
          anything we got wrong, then save.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>
            We don&apos;t ask for, or match on, age, gender, marital status, religion, nationality or photos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm key={review?.id ?? "current"} initial={initial} action={saveProfile} />
        </CardContent>
      </Card>
    </div>
  );
}
