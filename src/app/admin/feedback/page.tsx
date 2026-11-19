import { ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Read feedback" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminFeedback({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase } = await requireRole("admin");
  const id = (sp.id ?? "").trim();
  const reason = (sp.reason ?? "").trim();
  const asked = Boolean(id || reason);
  const bad = asked && !UUID.test(id) ? "Enter a valid feedback ID." : asked && !reason ? "Give a reason." : null;

  let body: React.ReactNode = null;
  if (asked && !bad) {
    // admin_read_feedback() refuses without a reason and writes the access to the audit log
    const { data, error } = await supabase.rpc("admin_read_feedback", { p_feedback_id: id, p_reason: reason });
    const f = (data ?? [])[0];
    body = error ? (
      <Alert tone="error">{error.message}</Alert>
    ) : !f ? (
      <Alert tone="warning">No feedback with that ID.</Alert>
    ) : (
      <Card>
        <CardHeader>
          <CardTitle>Feedback {String(f.id).slice(0, 8)}</CardTitle>
          <CardDescription>Access logged with reason: &ldquo;{reason}&rdquo;</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-[160px_1fr]">
            <dt className="text-muted-foreground">Outcome</dt>
            <dd className="font-medium">{f.outcome}</dd>
            <dt className="text-muted-foreground">Strengths</dt>
            <dd>{f.strengths.join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">Growth areas</dt>
            <dd>{f.growth_areas.join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">Private note</dt>
            <dd className="whitespace-pre-wrap">{f.private_note || "—"}</dd>
          </dl>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Read recruiter feedback"
        description="Recruiter feedback and private notes are internal. Reading one needs a reason, and every read is written to the audit log."
      />
      <Card>
        <CardContent className="pt-6">
          <form method="get" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Feedback ID" htmlFor="fb-id">
              <Input id="fb-id" name="id" defaultValue={id} required placeholder="e.g. 3f2c…" />
            </Field>
            <Field label="Reason for access" htmlFor="fb-reason">
              <Input id="fb-reason" name="reason" defaultValue={reason} required placeholder="e.g. takedown review" />
            </Field>
            <Button>
              <ShieldCheck className="h-4 w-4" aria-hidden /> Read and log
            </Button>
          </form>
        </CardContent>
      </Card>
      {bad && <Alert tone="warning">{bad}</Alert>}
      {body}
    </div>
  );
}
