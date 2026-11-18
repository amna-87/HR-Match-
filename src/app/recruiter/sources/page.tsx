import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardPaste, FileSpreadsheet, Rss } from "lucide-react";
import { requireRecruiter } from "@/lib/auth/session";
import { addFeed, deleteFeed, runFeedNow, toggleFeed } from "./actions";
import { FEED_CONNECTORS } from "@/lib/connectors";
import { CsvImport } from "@/components/csv-import";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Flash } from "@/components/flash";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Job sources" };

export default async function SourcesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, company, profile } = await requireRecruiter();
  if (!company) redirect("/recruiter");
  const ws = company as unknown as { id: string; source_cap: number };
  const { data: feeds } = await supabase
    .from("job_feeds")
    .select("id, provider, board, company_name, active, last_run_at, last_status, last_error, job_count")
    .eq("workspace_id", ws.id)
    .order("created_at");

  return (
    <div className="space-y-6">
      <Flash searchParams={sp} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Job sources</h1>
        <p className="text-muted-foreground max-w-3xl text-sm">
          Bring jobs into your workspace so you can match them against your talent pool. Company and source are
          optional; each job needs a title and one way to apply. No scraping: only jobs shared with you, files you own
          and official public job-board feeds.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5" aria-hidden /> Paste a job
          </CardTitle>
          <CardDescription>
            From a WhatsApp group, an email or a website: paste it and review the fields.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/recruiter/jobs/add" className={buttonClasses("outline")}>
            Paste a job post
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" aria-hidden /> Import a spreadsheet (CSV)
          </CardTitle>
          <CardDescription>Many jobs at once from Excel or Google Sheets (save as CSV).</CardDescription>
        </CardHeader>
        <CardContent>
          <CsvImport allowPublicBoard={profile.role === "admin"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rss className="h-5 w-5" aria-hidden /> Company career feeds
          </CardTitle>
          <CardDescription>
            Connect a company&apos;s official job board (Greenhouse or Lever). Vouch checks it once a day, adds new
            jobs, keeps listed ones open and closes jobs that disappear. Jobs are labeled &ldquo;From [company] careers
            page&rdquo;, the summary is written by us and Apply goes to the company&apos;s own page.{" "}
            {feeds?.length ?? 0} of {ws.source_cap} feeds used on your plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(feeds ?? []).length > 0 && (
            <ul className="divide-border border-border divide-y rounded-xl border text-sm">
              {feeds!.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="font-medium">
                      {f.company_name}{" "}
                      <Badge>
                        {FEED_CONNECTORS[f.provider as keyof typeof FEED_CONNECTORS]?.label}: {f.board}
                      </Badge>{" "}
                      {!f.active && <Badge tone="muted">Paused</Badge>}
                      {f.last_status === "error" && <Badge tone="danger">Last fetch failed</Badge>}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {f.job_count} open job{f.job_count === 1 ? "" : "s"}
                      {f.last_run_at ? ` · last checked ${formatDate(f.last_run_at)}` : ""}
                      {f.last_error ? ` · ${f.last_error}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={runFeedNow}>
                      <input type="hidden" name="id" value={f.id} />
                      <SubmitButton size="sm" variant="outline">
                        Fetch now
                      </SubmitButton>
                    </form>
                    <form action={toggleFeed}>
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="active" value={String(!f.active)} />
                      <Button size="sm" variant="ghost">
                        {f.active ? "Pause" : "Resume"}
                      </Button>
                    </form>
                    <form action={deleteFeed}>
                      <input type="hidden" name="id" value={f.id} />
                      <Button size="sm" variant="ghost">
                        Remove
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {(feeds?.length ?? 0) < ws.source_cap ? (
            <form action={addFeed} className="grid gap-3 sm:grid-cols-[160px_1fr_1fr_auto] sm:items-end">
              <Field label="Job board" htmlFor="provider">
                <Select id="provider" name="provider" defaultValue="greenhouse">
                  {Object.values(FEED_CONNECTORS).map((c) => (
                    <option key={c.provider} value={c.provider}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Board name or careers URL" htmlFor="board" hint="e.g. jobs.lever.co/acme or acme">
                <Input id="board" name="board" required maxLength={300} />
              </Field>
              <Field label="Company name" htmlFor="feed_company">
                <Input id="feed_company" name="company_name" required maxLength={200} />
              </Field>
              <SubmitButton>Connect</SubmitButton>
            </form>
          ) : (
            <p className="text-muted-foreground text-sm">You&apos;ve connected all the feeds your plan allows.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
