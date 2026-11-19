import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { readFeedback } from "../actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminAudit({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase } = await requireRole("admin");
  let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
  if (sp.action) q = q.ilike("action", `${sp.action.replace(/[%_]/g, "")}%`);
  if (sp.entity_id && /^[0-9a-f-]{36}$/i.test(sp.entity_id)) q = q.eq("entity_id", sp.entity_id);
  const { data: rows } = await q;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Audit log"
        description="Consent, access and moderation events, newest first."
      />
      <form method="get" className="flex flex-wrap items-end gap-2">
        <Field label="Action starts with" htmlFor="action">
          <Input id="action" name="action" defaultValue={sp.action ?? ""} placeholder="match." />
        </Field>
        <Field label="Entity id" htmlFor="entity_id">
          <Input id="entity_id" name="entity_id" defaultValue={sp.entity_id ?? ""} />
        </Field>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      <div className="border-border bg-card overflow-x-auto rounded-2xl border px-4 shadow-(--shadow-card)">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground border-border border-b text-left text-xs tracking-wide uppercase">
            <tr>
              <th className="py-3 pr-3 font-medium">Time</th>
              <th className="pr-3 font-medium">Actor</th>
              <th className="pr-3 font-medium">Action</th>
              <th className="pr-3 font-medium">Entity</th>
              <th className="pr-3 font-medium">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y font-mono">
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {new Date(r.created_at).toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td className="pr-3">
                  {r.actor_role}
                  {r.actor ? ` ${String(r.actor).slice(0, 8)}` : ""}
                </td>
                <td className="pr-3">{r.action}</td>
                <td className="pr-3">
                  {r.entity} {r.entity_id ? String(r.entity_id).slice(0, 8) : ""}
                </td>
                <td className="max-w-md truncate">{JSON.stringify(r.metadata)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Read private interview feedback</CardTitle>
          <CardDescription>Only for moderation or complaints. Your reason is permanently logged.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={readFeedback} className="flex flex-wrap items-end gap-2">
            <Field label="Feedback id" htmlFor="feedback_id">
              <Input id="feedback_id" name="feedback_id" required />
            </Field>
            <Field label="Reason (min 10 characters)" htmlFor="reason" className="w-full sm:w-auto">
              <Input id="reason" name="reason" required minLength={10} className="w-full sm:w-80" />
            </Field>
            <Button type="submit" variant="outline">
              Read
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
