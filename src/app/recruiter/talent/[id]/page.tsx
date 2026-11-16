import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/session";
import { saveTalentProfile, deleteTalentProfile } from "../actions";
import { loadProfileInput } from "@/lib/profile/load";
import { ProfileForm } from "@/components/profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonClasses } from "@/components/ui/button";
import { Flash } from "@/components/flash";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Talent pool profile" };

export default async function TalentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const { supabase, company } = await requireRecruiter();
  if (!company) redirect("/recruiter");
  // RLS: only returns the row if our company uploaded it and it is still unclaimed.
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, full_name, headline, summary, location, contact_email, contact_phone, languages, created_at")
    .eq("id", id)
    .eq("claim_status", "unclaimed")
    .maybeSingle();
  if (!candidate) notFound();
  const [initial, { data: resume }] = await Promise.all([
    loadProfileInput(supabase, candidate),
    supabase.from("resumes").select("original_filename").eq("candidate_id", id).eq("is_current", true).maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <Flash searchParams={await searchParams} />
      <Link href="/recruiter/talent" className="text-sm underline">
        ← Talent pool
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{candidate.full_name || "Unnamed profile"}</CardTitle>
          <CardDescription>
            Uploaded {formatDate(candidate.created_at)}. Only your company can see these details. Other companies see an
            anonymous card. The person can claim or delete this profile by signing up with{" "}
            {candidate.contact_email ? (
              <strong>{candidate.contact_email}</strong>
            ) : (
              "the email on the profile (none yet)"
            )}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {resume && (
            <a href={`/api/recruiter/talent-resume/${id}`} className={buttonClasses("outline", "sm")}>
              Download resume ({resume.original_filename})
            </a>
          )}
          <form action={deleteTalentProfile}>
            <input type="hidden" name="id" value={id} />
            <Button size="sm" variant="destructive">
              Delete profile and resume
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm initial={initial} action={saveTalentProfile.bind(null, id)} audience="recruiter" />
        </CardContent>
      </Card>
    </div>
  );
}
