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
  let query = supabase.from("users").select("id, email, role, status, created_at").order("created_at", { ascending: false }).limit(100);
  if (q) query = query.ilike("email", `%${q.replace(/[%_]/g, "")}%`);
  const { data: users } = await query;
  await audit(user.id, "admin", "admin.viewed_users", "users", null, { q });
  return (
    <div className="space-y-4">
      <Flash searchParams={sp} />
      <h1 className="text-2xl font-semibold">Users</h1>
      <form className="flex gap-2" method="get">
        <label htmlFor="q" className="sr-only">Search by email</label>
        <Input id="q" name="q" placeholder="Search by email" defaultValue={q} className="max-w-xs" />
        <Button variant="outline" type="submit">Search</Button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground"><tr><th className="py-2">Email</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr></thead>
          <tbody className="divide-y divide-border">
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="py-2">{u.email}</td>
                <td>{u.role}</td>
                <td><Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge></td>
                <td>{formatDate(u.created_at)}</td>
                <td className="text-right">
                  {u.role !== "admin" && (
                    <form action={setUserStatus}>
                      <input type="hidden" name="user_id" value={u.id} />
                      <input type="hidden" name="status" value={u.status === "active" ? "suspended" : "active"} />
                      <Button size="sm" variant={u.status === "active" ? "destructive" : "outline"}>{u.status === "active" ? "Suspend" : "Reactivate"}</Button>
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
