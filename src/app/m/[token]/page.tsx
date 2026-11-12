import Link from "next/link";
import { verifyToken } from "@/lib/consent/tokens";
import { getPool } from "@/lib/db";
import { respondFromEmail } from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/submit-button";
import { SourcedNotice, applyHref } from "@/components/job-source";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your match", robots: { index: false } };

const REASONS: Record<string, string> = {
  expired: "This link has expired. You can still review your matches from your dashboard.",
  bad_signature: "This link is invalid.",
  malformed: "This link is invalid.",
  wrong_purpose: "This link can't be used for that action.",
  rate_limited: "Too many requests. Please try again in a few minutes.",
};

export default async function EmailActionPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const v = verifyToken(decodeURIComponent(token), ["match_approve", "match_decline", "match_view"]);
  if (!v.ok) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Link not valid</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>{REASONS[v.reason]}</p>
          <Link href="/candidate" className="underline">
            Go to your dashboard
          </Link>
        </CardContent>
      </Card>
    );
  }
  const { p: purpose, s: matchId, c: candidateId } = v.payload;
  const db = getPool();
  const { rows } = await db.query(
    `select m.id, m.status, m.explanation, m.score, j.title, j.source_type, j.source_name, j.source_url, j.apply_method, j.apply_target,
            coalesce(co.name, j.source_company_name, 'An employer') as company
     from public.matches m join public.jobs j on j.id = m.job_id left join public.companies co on co.id = j.company_id
     where m.id = $1 and m.candidate_id = $2`,
    [matchId, candidateId],
  );
  const m = rows[0];
  if (!m) return <Alert tone="error">This match is no longer available.</Alert>;

  // Viewing a sourced listing is not consent to anything; it only records that it was seen.
  if (purpose === "match_view" && m.status === "notified") {
    await db
      .query("select public.respond_to_match($1, 'view', null, null, $2)", [matchId, candidateId])
      .catch(() => null);
  }
  const done = sp.done;
  const error = sp.error ? (REASONS[sp.error] ?? decodeURIComponent(sp.error)) : null;
  const answered = ["approved", "applied", "declined", "expired"].includes(m.status);

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>
          {m.title} · {m.company}
        </CardTitle>
        <CardDescription>{m.explanation}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {done === "applied" && (
          <Alert tone="success">Done — your application was sent. The recruiter can now see your profile.</Alert>
        )}
        {done === "declined" && <Alert tone="success">Declined. We won&apos;t ask you about this job again.</Alert>}
        {done === "expired" && <Alert tone="warning">This match expired before it was answered.</Alert>}

        {m.source_type === "sourced" ? (
          <>
            <SourcedNotice job={m} />
            {applyHref(m.apply_method, m.apply_target) && (
              <a
                href={applyHref(m.apply_method, m.apply_target)!}
                rel="noopener noreferrer nofollow"
                className="underline"
              >
                How to apply: {m.apply_target}
              </a>
            )}
          </>
        ) : answered && !done ? (
          <p className="text-sm">You already answered this match ({m.status}).</p>
        ) : !done ? (
          <form action={respondFromEmail} className="space-y-3">
            <input type="hidden" name="token" value={decodeURIComponent(token)} />
            {purpose === "match_approve" ? (
              <>
                <p className="text-sm">
                  Approving sends your profile and resume to {m.company} for this role. You can&apos;t undo a sent
                  application.
                </p>
                <SubmitButton pendingText="Sending…">Approve and apply</SubmitButton>
              </>
            ) : (
              <>
                <p className="text-sm">
                  Declining means we won&apos;t send your profile and won&apos;t ask about this job again.
                </p>
                <SubmitButton variant="outline">Decline this match</SubmitButton>
              </>
            )}
          </form>
        ) : null}
        <Link href="/candidate" className="block text-sm underline">
          Open your dashboard
        </Link>
      </CardContent>
    </Card>
  );
}
