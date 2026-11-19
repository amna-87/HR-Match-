import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/session";
import { updateCompany, inviteRecruiter, revokeInvitation, removeMember } from "../actions";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea, Select, Checkbox } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { supabase, company, isCompanyAdmin, user } = await requireRecruiter();
  if (!company) redirect("/recruiter");
  const c = company as unknown as {
    id: string;
    name: string;
    website: string | null;
    description: string | null;
    size: string | null;
    location: string | null;
    show_name_on_vetted_badge: boolean;
    kind: "company" | "personal";
    plan: string;
    pool_cap: number;
    batch_file_cap: number;
    daily_send_cap: number;
    source_cap: number;
    share_pool_anonymously: boolean;
  };
  const [{ data: members }, { data: invites }, { data: usageRows }] = await Promise.all([
    supabase.rpc("company_member_list", { p_company_id: c.id }),
    supabase
      .from("company_invitations")
      .select("id, email, role, expires_at")
      .eq("company_id", c.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase.rpc("workspace_usage", { p_workspace_id: c.id }),
  ]);
  const usage = (usageRows as Record<string, number>[] | null)?.[0];
  return (
    <div className="space-y-6">
      <Flash searchParams={await searchParams} />
      <PageHeader title="Workspace settings" description="Your company details, network sharing, plan and team." />
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            {c.kind === "personal"
              ? "Personal workspace: your jobs show \u201cHiring directly\u201d instead of a company name."
              : "Company workspace: the name below appears on your jobs."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateCompany} className="grid gap-4 sm:grid-cols-2">
            <fieldset disabled={!isCompanyAdmin} className="contents">
              <Field label={c.kind === "personal" ? "Workspace name" : "Company name"} htmlFor="name">
                <Input id="name" name="name" defaultValue={c.name} required />
              </Field>
              <Field label="Type" htmlFor="kind">
                <Select id="kind" name="kind" defaultValue={c.kind}>
                  <option value="company">Company (name shown on jobs)</option>
                  <option value="personal">Personal (jobs show &ldquo;Hiring directly&rdquo;)</option>
                </Select>
              </Field>
              <Field label="Website" htmlFor="website">
                <Input id="website" name="website" type="url" defaultValue={c.website ?? ""} />
              </Field>
              <Field label="Location" htmlFor="location">
                <Input id="location" name="location" defaultValue={c.location ?? ""} />
              </Field>
              <Field label="Size" htmlFor="size">
                <Input id="size" name="size" defaultValue={c.size ?? ""} />
              </Field>
              <Field label="Description" htmlFor="description" className="sm:col-span-2">
                <Textarea id="description" name="description" defaultValue={c.description ?? ""} />
              </Field>
              <div className="space-y-1 sm:col-span-2">
                <Checkbox
                  name="show_name_on_vetted_badge"
                  label='Show our company name on "Interview-vetted" recommendations'
                  defaultChecked={c.show_name_on_vetted_badge}
                />
                <p className="text-muted-foreground text-xs">
                  Off by default: candidates and other recruiters see &ldquo;a previous employer&apos;s
                  recruiter&rdquo;.
                </p>
              </div>
              <div className="border-border space-y-1 rounded-xl border p-4 sm:col-span-2">
                <Checkbox
                  name="share_pool_anonymously"
                  label="Share anonymous cards from our talent pool with the Vouch network"
                  defaultChecked={c.share_pool_anonymously}
                />
                <p className="text-muted-foreground text-xs">
                  Off by default: your uploaded resumes are visible only to your workspace. If on, other recruiters see
                  a card with headline, location, experience and skills, never the name, contact details or file. They
                  get full details only after the person agrees to an introduction.
                </p>
              </div>
              {isCompanyAdmin && <SubmitButton>Save</SubmitButton>}
            </fieldset>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Plan and usage</CardTitle>
          <CardDescription>You&apos;re on the {c.plan} plan. Paid plans with higher limits are coming.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Talent pool", usage?.pool_size ?? 0, c.pool_cap],
                ["Messages today", usage?.messages_today ?? 0, c.daily_send_cap],
                ["Connected job sources", usage?.sources ?? 0, c.source_cap],
                ["Files per upload", null, c.batch_file_cap],
              ] as const
            ).map(([label, used, cap]) => (
              <div key={label} className="space-y-1">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold">{used == null ? `up to ${cap}` : `${used} / ${cap}`}</dd>
                {used != null && cap > 0 && (
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
                    <div
                      className={used / cap > 0.9 ? "h-full bg-amber-500" : "bg-primary h-full"}
                      style={{ width: `${Math.min(100, Math.round((used / cap) * 100))}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground mt-4 text-xs">
            Last 30 days: {usage?.messages_30d ?? 0} messages prepared, {usage?.intros_30d ?? 0} introductions
            requested, {usage?.open_jobs ?? 0} open jobs.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recruiter seats</CardTitle>
          <CardDescription>
            Invite colleagues by email. They join after signing up or logging in as a recruiter with that address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">
            {((members ?? []) as { id: string; role: string; user_id: string; email: string }[]).map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                {m.email} · {m.role}
                {isCompanyAdmin && m.user_id !== user.id && (
                  <form action={removeMember}>
                    <input type="hidden" name="id" value={m.id} />
                    <Button size="sm" variant="ghost">
                      Remove
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {(invites ?? []).length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Pending invitations</p>
              <ul className="space-y-1 text-sm">
                {(invites ?? []).map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-2">
                    {inv.email} · {inv.role} · expires {formatDate(inv.expires_at)}
                    {isCompanyAdmin && (
                      <form action={revokeInvitation}>
                        <input type="hidden" name="id" value={inv.id} />
                        <Button size="sm" variant="ghost">
                          Revoke
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isCompanyAdmin && (
            <form action={inviteRecruiter} className="flex flex-wrap items-end gap-2">
              <Field label="Invite by email" htmlFor="email">
                <Input id="email" name="email" type="email" required />
              </Field>
              <Field label="Role" htmlFor="role">
                <Select id="role" name="role" defaultValue="recruiter">
                  <option value="recruiter">Recruiter</option>
                  <option value="admin">Admin</option>
                </Select>
              </Field>
              <SubmitButton variant="outline">Send invitation</SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
