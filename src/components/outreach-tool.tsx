"use client";
// C2: "Send this opportunity" — preview, lawful-basis confirmation, then Copy
// message / Export contact + job (launch), or email when switched on.
import { useState, useTransition } from "react";
import { Copy, Download, Mail } from "lucide-react";
import { prepareOutreachAction, type OutreachRow } from "@/app/recruiter/jobs/[id]/outreach/actions";
import { Button } from "@/components/ui/button";

export function OutreachTool({
  jobId,
  jobTitle,
  people,
  defaultIntro,
  preview,
  emailEnabled,
}: {
  jobId: string;
  jobTitle: string;
  people: { id: string; name: string }[];
  defaultIntro: string;
  preview: string;
  emailEnabled: boolean;
}) {
  const [intro, setIntro] = useState(defaultIntro);
  const [lawful, setLawful] = useState(false);
  const [rows, setRows] = useState<OutreachRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (channel: "copy" | "export" | "email") =>
    start(async () => {
      setError(null);
      if (!lawful) return setError("Please confirm you have a lawful basis to contact these people.");
      const res = await prepareOutreachAction(
        jobId,
        people.map((p) => p.id),
        channel,
        lawful,
        intro,
      );
      if (res.error) return setError(res.error);
      setRows(res.rows ?? []);
      if (res.csv) {
        const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `vouch-${jobTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-contacts.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(id);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="intro" className="text-sm font-medium">
          Your note (the job details, how to apply and the opt-out link are added for you)
        </label>
        <textarea
          id="intro"
          rows={3}
          maxLength={1500}
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          className="border-border bg-background w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>
      <details className="border-border rounded-xl border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Preview the message</summary>
        <pre className="text-muted-foreground mt-3 font-sans text-sm whitespace-pre-wrap">{preview}</pre>
      </details>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={lawful} onChange={(e) => setLawful(e.target.checked)} />
        <span>
          I have a lawful basis to contact these {people.length} people about this job (for example, they gave me their
          resume for job opportunities). Recorded in the audit log.
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run("copy")} disabled={pending}>
          <Copy className="h-4 w-4" aria-hidden /> Show messages to copy
        </Button>
        <Button variant="outline" onClick={() => run("export")} disabled={pending}>
          <Download className="h-4 w-4" aria-hidden /> Export contact + job (CSV)
        </Button>
        {emailEnabled && (
          <Button variant="outline" onClick={() => run("email")} disabled={pending}>
            <Mail className="h-4 w-4" aria-hidden /> Send by email
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        People marked &ldquo;do not contact&rdquo;, people who opted out of Vouch messages and anyone over your daily
        limit are left out automatically. Laws on contacting people from collected resumes vary by country.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {rows && (
        <ul className="divide-border border-border divide-y rounded-2xl border" role="status">
          {rows.map((r) => (
            <li key={r.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {r.name}
                  {!r.blocked && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {[r.email, r.phone].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </p>
                {r.blocked ? (
                  <span className="text-sm text-amber-700 dark:text-amber-300">Left out: {r.blocked}</span>
                ) : r.sent !== undefined ? (
                  <span className="text-sm">{r.sent ? "Email sent" : "Not sent"}</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => copy(r.id, r.message ?? "")}>
                    <Copy className="h-4 w-4" aria-hidden /> {copied === r.id ? "Copied" : "Copy message"}
                  </Button>
                )}
              </div>
              {r.message && !r.sent && (
                <pre className="bg-muted max-h-40 overflow-y-auto rounded-lg p-3 font-sans text-xs whitespace-pre-wrap">
                  {r.message}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
