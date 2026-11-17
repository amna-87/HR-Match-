import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/session";
import { savePoolProfile, deletePoolCandidate, updatePoolMeta } from "../actions";
import { ProfileForm } from "@/components/profile-form";
import type { ProfileInput } from "@/lib/profile-schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Flash } from "@/components/flash";
import { formatDate } from "@/lib/utils";
import { POOL_STATUS_LABELS } from "@/lib/pool/labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Talent pool profile" };

type J = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function toInput(p: J): ProfileInput {
  const arr = (v: unknown) => (Array.isArray(v) ? (v as J[]) : []);
  return {
    full_name: s(p.full_name),
    headline: s(p.headline),
    summary: s(p.summary),
    location: s(p.location),
    contact_email: s(p.contact_email),
    contact_phone: s(p.contact_phone),
    languages: (p.languages as string[]) ?? [],
    skills: (p.skills as string[]) ?? [],
    experiences: arr(p.experiences).map((e) => ({
      title: s(e.title),
      company: s(e.company),
      start_date: s(e.start_date),
      end_date: s(e.end_date),
      is_current: e.is_current === true,
      description: s(e.description),
    })),
    education: arr(p.education).map((e) => ({
      institution: s(e.institution),
      degree: s(e.degree),
      field: s(e.field),
      start_date: s(e.start_date),
      end_date: s(e.end_date),
    })),
    certifications: arr(p.certifications).map((c) => ({ name: s(c.name), issuer: s(c.issuer) })),
  };
}

export default async function PoolProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const { supabase, company } = await requireRecruiter();
  if (!company) redirect("/recruiter");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // RLS: only members of the owning workspace get the row.
  const { data: p } = await supabase.from("pool_candidates").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();

  return (
    <div className="space-y-6">
      <Flash searchParams={await searchParams} />
      <Link href="/recruiter/talent" className="text-sm underline">
        ← Talent pool
      </Link>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{p.full_name || "Unnamed profile"}</CardTitle>
            <Badge tone="info">{POOL_STATUS_LABELS[p.status as keyof typeof POOL_STATUS_LABELS]}</Badge>
            {p.do_not_contact && <Badge tone="danger">Do not contact</Badge>}
            {p.claimed_candidate_id && <Badge tone="success">Now on Vouch</Badge>}
          </div>
          <CardDescription>
            {[p.headline, p.location, `${Number(p.experience_years) || 0} yrs`].filter(Boolean).join(" · ")}
            <br />
            Added {formatDate(p.created_at)} · source: uploaded by your workspace
            {p.parsed_by === "basic" ? " · read by the basic reader, please check the details" : ""}. Private to your
            workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[p.contact_email, p.contact_phone].filter(Boolean).length > 0 && (
            <p className="w-full text-sm">{[p.contact_email, p.contact_phone].filter(Boolean).join(" · ")}</p>
          )}
          {p.storage_path && (
            <a href={`/api/recruiter/talent-resume/${id}`} className={buttonClasses("outline", "sm")}>
              Download resume ({p.original_filename})
            </a>
          )}
          <form action={deletePoolCandidate}>
            <input type="hidden" name="id" value={id} />
            <Button size="sm" variant="destructive">
              Delete profile and resume
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace notes</CardTitle>
          <CardDescription>
            Only your workspace sees these. Never shown to the person or other recruiters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updatePoolMeta.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" htmlFor="status">
              <Select id="status" name="status" defaultValue={p.status}>
                {Object.entries(POOL_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tags" htmlFor="tags" hint="Comma separated, e.g. karachi, senior, meta ads">
              <Input id="tags" name="tags" defaultValue={(p.tags ?? []).join(", ")} />
            </Field>
            <Field label="Private notes" htmlFor="notes" className="sm:col-span-2">
              <Textarea id="notes" name="notes" defaultValue={p.notes ?? ""} rows={4} />
            </Field>
            <div className="sm:col-span-2">
              <Checkbox
                name="do_not_contact"
                label="Do not contact this person (blocks sending and exporting their contact details)"
                defaultChecked={p.do_not_contact}
              />
            </div>
            <SubmitButton>Save notes</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm initial={toInput(p)} action={savePoolProfile.bind(null, id)} audience="recruiter" />
        </CardContent>
      </Card>
    </div>
  );
}
