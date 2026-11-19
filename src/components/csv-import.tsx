"use client";
// CSV / spreadsheet import with a column-mapping step (B2): choose a file, match
// its columns to job fields, preview, then import. Each row is checked on its own.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CSV_FIELDS, CSV_MAX_ROWS, guessMapping, parseCsv, type CsvField } from "@/lib/csv";
import { importCsvJobs, type CsvRowResult } from "@/app/recruiter/sources/actions";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { cn } from "@/lib/utils";

export function CsvImport({ allowPublicBoard = false }: { allowPublicBoard?: boolean }) {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Partial<Record<CsvField, number>>>({});
  const [publish, setPublish] = useState(true);
  const [allowDup, setAllowDup] = useState(false);
  const [publicBoard, setPublicBoard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CsvRowResult[] | null>(null);
  const [pending, start] = useTransition();

  async function onFile(f: File | undefined) {
    setError(null);
    setResults(null);
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return setError("The file is larger than 2 MB.");
    if (!/\.(csv|tsv|txt)$/i.test(f.name))
      return setError("Choose a .csv file (in Excel or Google Sheets: Save as CSV).");
    const all = parseCsv(await f.text());
    if (all.length < 2) return setError("The file needs a header row and at least one job.");
    if (all.length - 1 > CSV_MAX_ROWS) return setError(`Import at most ${CSV_MAX_ROWS} rows at a time.`);
    setHeaders(all[0]);
    setRows(all.slice(1));
    setMap(guessMapping(all[0]));
  }

  const mapped = useMemo(
    () =>
      rows.map((r) => {
        const o: Partial<Record<CsvField, string>> = {};
        for (const f of CSV_FIELDS) {
          const i = map[f.key];
          if (i != null && i >= 0) o[f.key] = r[i] ?? "";
        }
        return o;
      }),
    [rows, map],
  );

  const run = () =>
    start(async () => {
      setError(null);
      if (map.title == null) return setError("Choose which column holds the job title.");
      const res = await importCsvJobs(mapped, publish, allowDup, publicBoard);
      if (res.error) setError(res.error);
      else {
        setResults(res.results ?? []);
        router.refresh();
      }
    });

  const added = results?.filter((r) => r.status === "added").length ?? 0;
  return (
    <div className="space-y-4">
      <FileInput
        id="csv-file"
        label="Choose a CSV file"
        accept=".csv,.tsv,.txt,text/csv"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <p className="text-muted-foreground text-xs">
        One job per row. Only a title and one way to apply (email, WhatsApp, phone or link) are needed. Up to{" "}
        {CSV_MAX_ROWS} rows.
      </p>

      {headers.length > 0 && !results && (
        <>
          <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="mb-2 text-sm font-semibold">Match your columns</legend>
            {CSV_FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-sm">
                <span>
                  {f.label}
                  {"required" in f && f.required ? " *" : ""}
                </span>
                <select
                  className="border-border bg-background h-10 rounded-lg border px-2"
                  value={map[f.key] ?? -1}
                  onChange={(e) => setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                >
                  <option value={-1}>(not in this file)</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>

          <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <caption className="text-muted-foreground px-3 py-2 text-left text-xs">
                Preview of the first {Math.min(5, mapped.length)} of {mapped.length} rows
              </caption>
              <thead className="bg-muted">
                <tr>
                  {["Title", "Company", "Location", "Apply"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mapped.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-border border-t">
                    <td className="px-3 py-2">{r.title}</td>
                    <td className="px-3 py-2">{r.company || "Hiring directly"}</td>
                    <td className="px-3 py-2">{r.location}</td>
                    <td className="px-3 py-2">{r.apply_email || r.apply_whatsapp || r.apply_phone || r.apply_link}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              Open the jobs now (otherwise save as drafts)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} />
              Import jobs that look like duplicates
            </label>
            {allowPublicBoard && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={publicBoard} onChange={(e) => setPublicBoard(e.target.checked)} />
                Put them on the public job board now (admin)
              </label>
            )}
          </div>
          <Button onClick={run} disabled={pending}>
            {pending ? "Importing…" : `Import ${mapped.length} job${mapped.length === 1 ? "" : "s"}`}
          </Button>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {results && (
        <div className="space-y-2" role="status">
          <p className="text-sm font-medium">
            Imported {added} of {results.length} row{results.length === 1 ? "" : "s"}.
          </p>
          <ul className="divide-border border-border max-h-72 divide-y overflow-y-auto rounded-xl border text-sm">
            {results.map((r) => (
              <li key={r.row} className="flex justify-between gap-3 px-3 py-2">
                <span className="truncate">
                  Row {r.row}: {r.title}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    r.status === "added"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : r.status === "duplicate"
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-red-700 dark:text-red-300",
                  )}
                >
                  {r.status === "added" ? "Added" : r.status === "duplicate" ? "Skipped" : "Not added"}
                  {r.message ? `: ${r.message}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
