import Link from "next/link";
import { requireCandidate } from "@/lib/auth/session";
import {
  respondToMatch,
  setRedistribution,
  markNotificationsRead,
  claimUploadedProfile,
  deleteUploadedProfile,
} from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Flash } from "@/components/flash";
import { SourcedNotice, applyHref } from "@/components/job-source";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const stageTone = {
  new: "info",
  reviewed: "info",
  interview: "warning",
  offer: "success",
  hired: "success",
  rejected: "muted",
  redirected: "vetted",
} as const;

export default async function CandidateDashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { supabase, candidate } = await requireCandidate();
  const [{ data: matches }, { data: applications }, { data: offers }, { data: notes }, { data: uploaded }] =
    await Promise.all([
      supabase
        .from("matches")
        .select(
          "id, status, score, explanation, expires_at, notified_at, job:jobs(id, title, source_type, source_name, source_url, apply_method, apply_target, source_company_name, location, work_mode, company:companies(name))",
        )
        .in("status", ["notified", "viewed"])
        .order("score", { ascending: false }),
      supabase
        .from("applications")
        .select("id, stage, applied_at, job:jobs(id, title, apply_instructions, company:companies(name))")
        .order("applied_at", { ascending: false }),
      supabase.from("redistribution_consent").select("*").order("created_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("id, type, payload, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(10),
      // profiles a recruiter uploaded for this (verified) email address — D-022
      supabase.rpc("my_uploaded_profiles"),
    ]);
  const uploadedProfiles = (uploaded ?? []) as {
    id: string;
    company_name: string;
    headline: string | null;
    skills_count: number;
    uploaded_at: string;
  }[];
  const unread = (notes ?? []).filter((n) => !n.read_at).length;
  type JobRef = {
    id: string;
    title: string;
    source_type: "verified" | "sourced";
    source_name: string | null;
    source_url: string | null;
    apply_method: string;
    apply_target: string | null;
    source_company_name: string | null;
    location: string | null;
    work_mode: string;
    company: { name: string } | null;
  };

  return (
    <div className="space-y-8">
      <Flash searchParams={await searchParams} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">
            Hi{candidate.full_name ? `, ${candidate.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm">
            Nothing is sent to an employer unless you approve it here or from an email.
          </p>
        </div>
        {(!candidate.open_to_work || candidate.visibility_paused) && (
          <Alert tone="warning">
            Your profile is {candidate.visibility_paused ? "paused" : "not open to opportunities"} — you won&apos;t get
            new matches.{" "}
            <Link href="/candidate/settings" className="underline">
              Change
            </Link>
          </Alert>
        )}
      </div>

      {uploadedProfiles.map((u) => (
        <Card key={u.id} className="border-sky-300">
          <CardHeader>
            <CardTitle>A recruiter added a profile for you</CardTitle>
            <CardDescription>
              A recruiter at <strong>{u.company_name}</strong> uploaded your resume on {formatDate(u.uploaded_at)}
              {u.headline ? ` (${u.headline}, ${u.skills_count} skills)` : ""}. Add it to your profile to get matched to
              jobs right away, or delete it. Either way, that company no longer sees it afterwards.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <form action={claimUploadedProfile}>
              <input type="hidden" name="id" value={u.id} />
              <Button>Add to my profile</Button>
            </form>
            <form action={deleteUploadedProfile}>
              <input type="hidden" name="id" value={u.id} />
              <Button variant="outline">Delete it</Button>
            </form>
          </CardContent>
        </Card>
      ))}

      {!candidate.headline && !uploadedProfiles.length && (
        <Alert>
          Start by{" "}
          <Link href="/candidate/profile" className="underline">
            uploading your resume
          </Link>{" "}
          so we can match you.
        </Alert>
      )}

      <section aria-labelledby="matches-h" className="space-y-3">
        <h2 id="matches-h" className="text-xl font-semibold">
          Matches waiting for you
        </h2>
        {!matches?.length && (
          <p className="text-muted-foreground text-sm">No matches waiting. We&apos;ll email you when a job fits.</p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {(matches ?? []).map((m) => {
            const job = m.job as unknown as JobRef;
            const company = job.company?.name ?? job.source_company_name ?? "Employer";
            return (
              <Card key={m.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>
                      <Link href={`/jobs/${job.id}`} className="hover:underline">
                        {job.title}
                      </Link>
                    </CardTitle>
                    <Badge tone="info">{Math.round(Number(m.score))}% match</Badge>
                  </div>
                  <CardDescription>
                    {company}
                    {job.location ? ` · ${job.location}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{m.explanation}</p>
                  {job.source_type === "sourced" ? (
                    <>
                      <SourcedNotice job={job} />
                      {applyHref(job.apply_method, job.apply_target) && (
                        <a
                          className="text-sm underline"
                          href={applyHref(job.apply_method, job.apply_target)!}
                          rel="noopener noreferrer nofollow"
                          target="_blank"
                        >
                          Apply via original listing
                        </a>
                      )}
                      {m.status === "notified" && (
                        <form action={respondToMatch}>
                          <input type="hidden" name="match_id" value={m.id} />
                          <input type="hidden" name="decision" value="view" />
                          <Button size="sm" variant="ghost">
                            Mark as seen
                          </Button>
                        </form>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <form action={respondToMatch}>
                        <input type="hidden" name="match_id" value={m.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <Button size="sm">Approve &amp; apply</Button>
                      </form>
                      <form action={respondToMatch}>
                        <input type="hidden" name="match_id" value={m.id} />
                        <input type="hidden" name="decision" value="decline" />
                        <Button size="sm" variant="outline">
                          Decline
                        </Button>
                      </form>
                    </div>
                  )}
                  <p className="text-muted-foreground text-xs">Expires {formatDate(m.expires_at)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section id="visibility" aria-labelledby="vis-h" className="space-y-3">
        <h2 id="vis-h" className="text-xl font-semibold">
          Recruiter recommendations
        </h2>
        {!offers?.length && (
          <p className="text-muted-foreground text-sm">
            When a recruiter recommends you for other roles, you&apos;ll decide here.
          </p>
        )}
        {(offers ?? []).map((o) => (
          <Card key={o.id}>
            <CardContent className="space-y-2 pt-5">
              <p>
                <strong>{o.source_label === "a previous employer's recruiter" ? "A recruiter" : o.source_label}</strong>{" "}
                flagged you as strong for <strong>{o.domain}</strong>
                {o.strengths.length > 0 && <> (strengths: {o.strengths.join(", ")})</>}.
              </p>
              <p className="text-muted-foreground text-sm">
                If you opt in, recruiters hiring in this area can see an &ldquo;Interview-vetted&rdquo; card with these
                strengths (not your name or contact details) and you may get more matches. You can withdraw at any time.
              </p>
              <div className="flex items-center gap-2">
                <Badge tone={o.status === "opted_in" ? "success" : o.status === "pending" ? "warning" : "muted"}>
                  {o.status.replace("_", " ")}
                </Badge>
                {o.status === "pending" && (
                  <>
                    <form action={setRedistribution}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="status" value="opted_in" />
                      <Button size="sm">Yes, make me visible for {o.domain}</Button>
                    </form>
                    <form action={setRedistribution}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="status" value="declined" />
                      <Button size="sm" variant="outline">
                        No thanks
                      </Button>
                    </form>
                  </>
                )}
                {o.status === "opted_in" && (
                  <form action={setRedistribution}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="status" value="withdrawn" />
                    <Button size="sm" variant="outline">
                      Withdraw
                    </Button>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-labelledby="apps-h" className="space-y-3">
        <h2 id="apps-h" className="text-xl font-semibold">
          Your applications
        </h2>
        {!applications?.length && <p className="text-muted-foreground text-sm">No applications yet.</p>}
        <ul className="divide-border border-border bg-card divide-y rounded-lg border">
          {(applications ?? []).map((a) => {
            const job = a.job as unknown as {
              id: string;
              title: string;
              apply_instructions: string | null;
              company: { name: string } | null;
            };
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  {job.title} · <span className="text-muted-foreground">{job.company?.name}</span>
                  {job.apply_instructions && (
                    <span className="text-muted-foreground block text-xs whitespace-pre-line">
                      Next steps: {job.apply_instructions}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <Badge tone={stageTone[a.stage as keyof typeof stageTone]}>{a.stage}</Badge>
                  <span className="text-muted-foreground">{formatDate(a.applied_at)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="notes-h" className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 id="notes-h" className="text-xl font-semibold">
            Notifications
          </h2>
          {unread > 0 && (
            <form action={markNotificationsRead}>
              <Button size="sm" variant="ghost">
                Mark {unread} as read
              </Button>
            </form>
          )}
        </div>
        <ul className="space-y-1 text-sm">
          {(notes ?? []).map((n) => (
            <li key={n.id} className={n.read_at ? "text-muted-foreground" : ""}>
              {formatDate(n.created_at)} —{" "}
              {n.type === "match"
                ? `New match: ${(n.payload as { job_title?: string }).job_title ?? "a job"}`
                : n.type === "redistribution_offer"
                  ? "A recruiter recommended you for other roles"
                  : n.type}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
