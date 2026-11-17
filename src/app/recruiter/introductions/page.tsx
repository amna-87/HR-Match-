import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/session";
import { withdrawIntroduction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flash } from "@/components/flash";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Introductions" };

const LABEL: Record<string, [string, "success" | "info" | "muted" | "danger"]> = {
  waiting_owner: ["Waiting for the person", "info"],
  waiting_person: ["Waiting for the person", "info"],
  accepted: ["Introduced", "success"],
  declined: ["Not available", "muted"],
  withdrawn: ["Withdrawn", "muted"],
};

type Row = {
  id: string;
  job_id: string;
  job_title: string;
  status: string;
  created_at: string;
  headline: string | null;
  location: string | null;
  experience_years: number;
  full_name: string | null;
};

export default async function IntroductionsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { supabase, company } = await requireRecruiter();
  if (!company) redirect("/recruiter");
  const { data } = await supabase.rpc("sent_introductions", { p_workspace_id: company.id });
  const rows = (data ?? []) as Row[];
  return (
    <div className="space-y-6">
      <Flash searchParams={await searchParams} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Introductions</h1>
        <p className="text-muted-foreground text-sm">
          People from the Vouch network you asked to meet. Their details appear once they agree. If they decline, you
          see &ldquo;Not available&rdquo; and never who it was.
        </p>
      </div>
      {rows.length ? (
        <ul className="divide-border border-border bg-card divide-y rounded-2xl border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="space-y-0.5">
                <p className="font-medium">
                  {r.status === "accepted" ? (
                    <Link href={`/recruiter/introductions/${r.id}`} className="hover:underline">
                      {r.full_name || "Unnamed profile"}
                    </Link>
                  ) : (
                    r.headline || "Anonymous profile"
                  )}{" "}
                  <Badge tone={LABEL[r.status]?.[1]}>{LABEL[r.status]?.[0] ?? r.status}</Badge>
                </p>
                <p className="text-muted-foreground text-sm">
                  For{" "}
                  <Link href={`/recruiter/jobs/${r.job_id}`} prefetch={false} className="underline">
                    {r.job_title}
                  </Link>{" "}
                  · asked {formatDate(r.created_at)}
                </p>
              </div>
              {(r.status === "waiting_owner" || r.status === "waiting_person") && (
                <form action={withdrawIntroduction}>
                  <input type="hidden" name="id" value={r.id} />
                  <Button size="sm" variant="ghost">
                    Withdraw
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          No introductions yet. Open one of your jobs to see matching people from the Vouch network.
        </p>
      )}
    </div>
  );
}
