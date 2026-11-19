import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Network, Users } from "lucide-react";
import { rankPoolForJob, type PoolMatch } from "@/lib/pool/rank";
import { requestIntroduction } from "../../introductions/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { POOL_STATUS_LABELS } from "@/lib/pool/labels";

const INTRO_LABEL: Record<string, string> = {
  waiting_owner: "Asked: waiting for the person",
  waiting_person: "Asked: waiting for the person",
  accepted: "Introduced",
  declined: "Not available",
  withdrawn: "Withdrawn",
};

function Score({ score }: { score: number }) {
  return <Badge tone={score >= 70 ? "success" : score >= 50 ? "info" : "muted"}>{Math.round(score)}% fit</Badge>;
}

/**
 * C1: "Top matches from your pool" for one job, plus anonymous cards from pools
 * shared with the Vouch network (introduction only with the person's consent).
 * The own-pool list is selectable for outreach (C2).
 */
export async function PoolMatches({ supabase, jobId }: { supabase: SupabaseClient; jobId: string }) {
  const { own, network } = await rankPoolForJob(supabase, jobId, 30);
  return (
    <div className="space-y-8">
      <section aria-labelledby="pool-h" className="space-y-3">
        <h2 id="pool-h" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Users className="h-5 w-5" aria-hidden /> Top matches from your pool
        </h2>
        {own.length ? (
          <form action={`/recruiter/jobs/${jobId}/outreach`} method="get" className="space-y-3">
            <OwnList own={own} selectable />
            <Button>Send this opportunity to selected</Button>
          </form>
        ) : (
          <p className="text-muted-foreground text-sm">
            No profiles in your talent pool yet.{" "}
            <Link href="/recruiter/talent" className="underline">
              Upload resumes
            </Link>{" "}
            to see matches here.
          </p>
        )}
      </section>

      {network.length > 0 && (
        <section id="network" aria-labelledby="net-h" className="space-y-3">
          <h2 id="net-h" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Network className="h-5 w-5" aria-hidden /> From the Vouch network
          </h2>
          <p className="text-muted-foreground text-sm">
            Anonymous profiles other recruiters chose to share. Ask for an introduction: we ask the person first, and
            you see their name, contact details and resume only if they agree.
          </p>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {network.map((m) => (
              <li key={m.candidateId} className="border-border bg-card space-y-2 rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{m.headline || "Anonymous profile"}</p>
                  <Score score={m.score} />
                </div>
                <p className="text-muted-foreground text-sm">
                  {[m.location, `${m.experienceYears} yrs`].filter(Boolean).join(" · ")}
                </p>
                <p className="text-xs">{m.skills.slice(0, 10).join(", ")}</p>
                <p className="text-muted-foreground text-xs">{m.reason}</p>
                {m.intro && m.intro.status !== "withdrawn" ? (
                  <p className="text-sm font-medium">
                    {m.intro.status === "accepted" ? (
                      <Link href={`/recruiter/introductions/${m.intro.id}`} className="text-primary underline">
                        Introduced: view profile
                      </Link>
                    ) : (
                      INTRO_LABEL[m.intro.status]
                    )}
                  </p>
                ) : (
                  <form action={requestIntroduction} className="space-y-2">
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="pool_candidate_id" value={m.candidateId} />
                    <label className="sr-only" htmlFor={`msg-${m.candidateId}`}>
                      Message to the person (optional)
                    </label>
                    <textarea
                      id={`msg-${m.candidateId}`}
                      name="message"
                      rows={2}
                      maxLength={1000}
                      placeholder="Optional note to the person, e.g. why this role suits them"
                      className="border-border bg-background w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <Button size="sm" variant="outline">
                      Request introduction
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function OwnList({ own, selectable = false }: { own: PoolMatch[]; selectable?: boolean }) {
  return (
    <ul className="divide-border border-border bg-card divide-y rounded-2xl border">
      {own.map((m) => (
        <li key={m.candidateId} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            {selectable && (
              <input
                type="checkbox"
                name="pool_ids"
                value={m.candidateId}
                disabled={m.doNotContact}
                aria-label={`Select ${m.fullName || "this profile"}`}
                className="mt-1.5"
              />
            )}
            <div className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                <Link href={`/recruiter/talent/${m.candidateId}`} prefetch={false} className="hover:underline">
                  {m.fullName || "Unnamed profile"}
                </Link>
                {m.status && <Badge>{POOL_STATUS_LABELS[m.status as keyof typeof POOL_STATUS_LABELS]}</Badge>}
                {m.doNotContact && <Badge tone="danger">Do not contact</Badge>}
              </p>
              <p className="text-muted-foreground text-sm">
                {[m.headline, m.location, `${m.experienceYears} yrs`].filter(Boolean).join(" · ")}
              </p>
              <p className="text-sm">{m.reason}</p>
            </div>
          </div>
          <Score score={m.score} />
        </li>
      ))}
    </ul>
  );
}
