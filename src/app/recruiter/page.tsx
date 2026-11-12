import Link from "next/link";
import { requireRecruiter } from "@/lib/auth/session";
import { createCompany } from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Flash } from "@/components/flash";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs" };

const statusTone = { draft: "muted", published: "success", paused: "warning", closed: "muted", expired: "muted", removed: "danger" } as const;

export default async function RecruiterHome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, company } = await requireRecruiter();
  if (!company) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>Set up your company</CardTitle>
          <CardDescription>You can only post jobs for a company you belong to.</CardDescription>
        </CardHeader>
        <CardContent>
          <Flash searchParams={sp} />
          <form action={createCompany} className="space-y-4">
            <Field label="Company name" htmlFor="name">
              <Input id="name" name="name" required maxLength={200} />
            </Field>
            <Field label="Website" htmlFor="website">
              <Input id="website" name="website" type="url" placeholder="https://" />
            </Field>
            <Field label="Location" htmlFor="location">
              <Input id="location" name="location" />
            </Field>
            <Field label="Size" htmlFor="size" hint="e.g. 11-50">
              <Input id="size" name="size" />
            </Field>
            <Field label="Description" htmlFor="description">
              <Textarea id="description" name="description" />
            </Field>
            <SubmitButton>Create company</SubmitButton>
          </form>
        </CardContent>
      </Card>
    );
  }
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, status, published_at, expires_at, applications(count)")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });
  return (
    <div className="space-y-6">
      <Flash searchParams={sp} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{company.name} · Jobs</h1>
        <Link href="/recruiter/jobs/new" className={buttonClasses()}>Post a job</Link>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {(jobs ?? []).map((j) => (
          <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <Link href={`/recruiter/jobs/${j.id}`} className="font-medium hover:underline">{j.title}</Link>
            <span className="flex items-center gap-3 text-sm">
              <span>{(j.applications as unknown as { count: number }[])[0]?.count ?? 0} applicants</span>
              <Badge tone={statusTone[j.status as keyof typeof statusTone]}>{j.status}</Badge>
              <span className="text-muted-foreground">{j.published_at ? `Published ${formatDate(j.published_at)}` : "Not published"}</span>
            </span>
          </li>
        ))}
        {!jobs?.length && <li className="px-4 py-6 text-sm text-muted-foreground">No jobs yet.</li>}
      </ul>
    </div>
  );
}
