import { requireCandidate } from "@/lib/auth/session";
import { savePreferences, blockCompany, unblockCompany } from "../actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input, Select, Checkbox } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Flash } from "@/components/flash";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preferences" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { supabase, candidate: c } = await requireCandidate();
  const [{ data: companies }, { data: blocked }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("status", "active").order("name"),
    supabase.from("blocked_companies").select("id, company:companies(id, name)"),
  ]);
  const blockedIds = new Set((blocked ?? []).map((b) => (b.company as unknown as { id: string }).id));
  return (
    <div className="space-y-6">
      <Flash searchParams={await searchParams} />
      <form action={savePreferences} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Job preferences</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Desired roles" htmlFor="desired_roles" hint="Comma separated">
              <Input id="desired_roles" name="desired_roles" defaultValue={c.desired_roles.join(", ")} />
            </Field>
            <Field label="Industries" htmlFor="industries" hint="Comma separated">
              <Input id="industries" name="industries" defaultValue={c.industries.join(", ")} />
            </Field>
            <Field label="Preferred locations" htmlFor="preferred_locations" hint="Cities you'd work in (besides your own)">
              <Input id="preferred_locations" name="preferred_locations" defaultValue={c.preferred_locations.join(", ")} />
            </Field>
            <Field label="Availability" htmlFor="availability" hint="e.g. Immediately, 1 month notice">
              <Input id="availability" name="availability" defaultValue={c.availability ?? ""} />
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Work modes (none = any)</legend>
              {(["remote", "hybrid", "onsite"] as const).map((m) => (
                <Checkbox key={m} name={`mode_${m}`} label={m === "onsite" ? "On-site" : m[0].toUpperCase() + m.slice(1)} defaultChecked={c.work_mode_pref.includes(m)} />
              ))}
            </fieldset>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Salary min" htmlFor="salary_min">
                <Input id="salary_min" name="salary_min" type="number" min={0} defaultValue={c.salary_min ?? ""} />
              </Field>
              <Field label="Salary max" htmlFor="salary_max">
                <Input id="salary_max" name="salary_max" type="number" min={0} defaultValue={c.salary_max ?? ""} />
              </Field>
              <Field label="Currency" htmlFor="salary_currency">
                <Input id="salary_currency" name="salary_currency" maxLength={3} placeholder="EUR" defaultValue={c.salary_currency ?? ""} />
              </Field>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Visibility</CardTitle>
            <CardDescription>Recruiters never see your profile unless you approve a match (or opt in to a recruiter recommendation).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Checkbox name="open_to_work" label="Open to opportunities" defaultChecked={c.open_to_work} />
            <Checkbox name="visibility_paused" label="Pause my profile (no new matches)" defaultChecked={c.visibility_paused} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Checkbox name="match_emails_enabled" label="Email me about new matches" defaultChecked={c.match_emails_enabled} />
            <Field label="Email frequency" htmlFor="match_email_frequency">
              <Select id="match_email_frequency" name="match_email_frequency" defaultValue={c.match_email_frequency}>
                <option value="instant">As they happen (max a few per week)</option>
                <option value="daily">At most daily</option>
                <option value="weekly">At most weekly</option>
              </Select>
            </Field>
          </CardContent>
        </Card>
        <SubmitButton>Save preferences</SubmitButton>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Blocked companies</CardTitle>
          <CardDescription>Blocked companies are never matched with you and can never see your profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1 text-sm">
            {(blocked ?? []).map((b) => (
              <li key={b.id} className="flex items-center gap-2">
                {(b.company as unknown as { name: string }).name}
                <form action={unblockCompany}>
                  <input type="hidden" name="id" value={b.id} />
                  <Button size="sm" variant="ghost">Unblock</Button>
                </form>
              </li>
            ))}
          </ul>
          <form action={blockCompany} className="flex flex-wrap items-end gap-2">
            <Field label="Block a company" htmlFor="company_id">
              <Select id="company_id" name="company_id" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {(companies ?? []).filter((co) => !blockedIds.has(co.id)).map((co) => (
                  <option key={co.id} value={co.id}>{co.name}</option>
                ))}
              </Select>
            </Field>
            <SubmitButton variant="outline">Block</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
