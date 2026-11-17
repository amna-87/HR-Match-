import { requireRole } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

const LABELS: Record<string, string> = {
  users: "Users",
  candidates: "Candidates",
  recruiters: "Recruiters",
  jobs_published: "Published jobs",
  jobs_sourced: "Published sourced jobs",
  matches: "Matches",
  approvals: "Approvals",
  applications: "Applications",
  open_takedowns: "Open takedown requests",
};

export default async function AdminHome() {
  const { supabase } = await requireRole("admin");
  const { data } = await supabase.rpc("admin_counts");
  const counts = (data ?? {}) as Record<string, number>;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Platform overview</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {Object.entries(LABELS).map(([k, label]) => (
          <Card key={k}>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{counts[k] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
