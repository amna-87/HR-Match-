import { requireRole } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

export default async function AdminFeedback({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase } = await requireRole("admin");
  // admin_read_feedback() refuses without a reason and writes the access to the audit log
  const { data, error } = await supabase.rpc("admin_read_feedback", { p_feedback_id: sp.id ?? "", p_reason: sp.reason ?? "" });
  if (error) return <Alert tone="error">{error.message}</Alert>;
  const f = (data ?? [])[0];
  if (!f) return <Alert tone="warning">Not found.</Alert>;
  return (
    <Card>
      <CardHeader><CardTitle>Feedback {String(f.id).slice(0, 8)}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>Access logged with reason: “{sp.reason}”</p>
        <p><strong>Outcome:</strong> {f.outcome}</p>
        <p><strong>Strengths:</strong> {f.strengths.join(", ")}</p>
        <p><strong>Growth areas:</strong> {f.growth_areas.join(", ")}</p>
        <p><strong>Private note:</strong> {f.private_note}</p>
      </CardContent>
    </Card>
  );
}
