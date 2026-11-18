import Link from "next/link";
import { requireRecruiter } from "@/lib/auth/session";
import { createCompany, acceptInvitation, confirmJobOpen } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Flash } from "@/components/flash";
import { formatDate } from "@/lib/utils";
import { RecruiterOverview } from "./overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs" };

const statusTone = {
  draft: "muted",
  published: "success",
  paused: "warning",
  closed: "muted",
  expired: "muted",
  removed: "danger",
} as const;

export default async function RecruiterHome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, company, profile } = await requireRecruiter();
  const { data: myInvites } = await supabase
    .from("company_invitations")
    .select("id, role, expires_at, company:companies(name)")
    .eq("status", "pending")
    .ilike("email", profile.email)
    .gt("expires_at", new Date().toISOString());
  const invitesCard = (myInvites ?? []).length > 0 && (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>You&apos;ve been invited</CardTitle>
        <CardDescription>Accept to join the company&apos;s hiring team.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {(myInvites ?? []).map((inv) => (
          <form key={inv.id} action={acceptInvitation} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={inv.id} />
            <span>
              <strong>{(inv.company as unknown as { name: string } | null)?.name}</strong> · {inv.role}
            </span>
            <Button size="sm">Accept</Button>
          </form>
        ))}
      </CardContent>
    </Card>
  );
  if (!company) {
    return (
      <div className="space-y-6">
        <Flash searchParams={sp} />
        {invitesCard}
        <div className="mx-auto max-w-3xl space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Set up your workspace</h1>
          <p className="text-muted-foreground">
            Your workspace holds your jobs and your private talent pool. Nobody outside it can see your resumes.
          </p>
        </div>
        <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Just me</CardTitle>
              <CardDescription>
                For independent recruiters and HR people. Your jobs show &ldquo;Hiring directly&rdquo; with how to
                apply.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createCompany} className="space-y-4">
                <input type="hidden" name="kind" value="personal" />
                <Field label="Workspace name (optional)" htmlFor="pname">
                  <Input id="pname" name="name" maxLength={200} placeholder="My recruiting" />
                </Field>
                <SubmitButton>Start my workspace</SubmitButton>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>A company</CardTitle>
              <CardDescription>The company name appears on your jobs. Invite colleagues later.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createCompany} className="space-y-4">
                <input type="hidden" name="kind" value="company" />
                <Field label="Company name" htmlFor="name">
                  <Input id="name" name="name" required maxLength={200} />
                </Field>
                <Field label="Website" htmlFor="website">
                  <Input id="website" name="website" type="url" placeholder="https://" />
                </Field>
                <Field label="Location" htmlFor="location">
                  <Input id="location" name="location" />
                </Field>
                <SubmitButton>Create company</SubmitButton>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, status, published_at, expires_at, source_type, visibility, applications(count)")
    .eq("owner_workspace_id", company.id)
    .order("created_at", { ascending: false });
  const [{ data: usageRows }, { data: introRows }, { count: processing }] = await Promise.all([
    supabase.rpc("workspace_usage", { p_workspace_id: company.id }),
    supabase.rpc("introductions_for_my_pool", { p_workspace_id: company.id }),
    supabase
      .from("pool_import_files")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", company.id)
      .in("status", ["queued", "parsing"]),
  ]);
  const pendingIntros = ((introRows ?? []) as { status: string }[]).filter((i) => i.status === "waiting_owner").length;
  return (
    <div className="space-y-6">
      <Flash searchParams={sp} />
      {invitesCard}
      <RecruiterOverview
        name={company.name}
        usage={(usageRows as never[] | null)?.[0] ?? null}
        pendingIntros={pendingIntros}
        sharing={Boolean((company as { share_pool_anonymously?: boolean }).share_pool_anonymously)}
        processing={processing ?? 0}
      />
      <div id="jobs" className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="text-xl font-semibold tracking-tight">Your jobs ({jobs?.length ?? 0})</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/recruiter/jobs/add" className={buttonClasses("outline")}>
            Add a job from another source
          </Link>
        </div>
      </div>
      <ul className="divide-border border-border bg-card divide-y rounded-2xl border">
        {(jobs ?? []).map((j) => (
          <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <Link href={`/recruiter/jobs/${j.id}`} prefetch={false} className="font-medium hover:underline">
              {j.title}
            </Link>
            <span className="flex flex-wrap items-center gap-3 text-sm">
              {j.source_type === "sourced" ? (
                <Badge tone="sourced">
                  {j.visibility === "public" ? "Sourced · public" : "Sourced · workspace only"}
                </Badge>
              ) : (
                <span>{(j.applications as unknown as { count: number }[])[0]?.count ?? 0} applicants</span>
              )}
              <Badge tone={statusTone[j.status as keyof typeof statusTone]}>{j.status}</Badge>
              {(() => {
                const days = j.expires_at
                  ? Math.ceil((new Date(j.expires_at).getTime() - Date.now()) / 86400_000)
                  : null;
                if (days == null || days > 7 || !["published", "expired"].includes(j.status))
                  return (
                    <span className="text-muted-foreground">
                      {j.published_at ? `Published ${formatDate(j.published_at)}` : "Not published"}
                    </span>
                  );
                return (
                  <form action={confirmJobOpen} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={j.id} />
                    <span className="text-amber-700 dark:text-amber-300">
                      {days > 0 ? `Closes in ${days} day${days === 1 ? "" : "s"}` : "Expired"}. Still open?
                    </span>
                    <Button size="sm" variant="outline">
                      Yes
                    </Button>
                  </form>
                );
              })()}
            </span>
          </li>
        ))}
        {!jobs?.length && (
          <li className="text-muted-foreground px-4 py-8 text-center text-sm">
            No jobs yet. Post your own, paste one from WhatsApp or email, or import a spreadsheet.
          </li>
        )}
      </ul>
    </div>
  );
}
