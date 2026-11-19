import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { setUserStatus } from "../actions";
import { audit } from "@/lib/server/context";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/flash";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireRole("admin");
  const q = (sp.q ?? "").trim();
  let query = supabase
    .from("users")
    .select("id, email, role, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) query = query.ilike("email", `%${q.replace(/[%_]/g, "")}%`);
  const { data: users } = await query;
  await audit(user.id, "admin", "admin.viewed_users", "users", null, { q });
  return (
    <div className="space-y-6">
      <Flash searchParams={sp} />
      <PageHeader eyebrow="Admin" title="Users" description="Find accounts by email, change roles and suspend abuse." />
      <form className="flex w-full max-w-md gap-2" method="get">
        <label htmlFor="q" className="sr-only">
          Search by email
        </label>
        <Input id="q" name="q" placeholder="Search by email" defaultValue={q} className="min-w-0 flex-1" />
        <Button variant="outline" type="submit">
          Search
        </Button>
      </form>
      <div className="border-border bg-card overflow-x-auto rounded-2xl border px-4 shadow-(--shadow-card)">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-muted-foreground border-border border-b text-left text-xs tracking-wide uppercase">
            <tr>
              <th className="py-3 pr-3 font-medium">Email</th>
              <th className="pr-3 font-medium">Role</th>
              <th className="pr-3 font-medium">Status</th>
              <th className="pr-3 font-medium">Joined</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="py-3 pr-3 whitespace-nowrap">{u.email}</td>
                <td className="pr-3 capitalize">{u.role}</td>
                <td>
                  <Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge>
                </td>
                <td className="pr-3 whitespace-nowrap">{formatDate(u.created_at)}</td>
                <td className="py-2 text-right">
                  {u.role !== "admin" && (
                    <form action={setUserStatus}>
                      <input type="hidden" name="user_id" value={u.id} />
                      <input type="hidden" name="status" value={u.status === "active" ? "suspended" : "active"} />
                      <Button size="sm" variant={u.status === "active" ? "destructive" : "outline"}>
                        {u.status === "active" ? "Suspend" : "Reactivate"}
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
