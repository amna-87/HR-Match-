"use client";
// Bulk resume upload (A2): drag and drop PDF/DOCX files or one ZIP. Files go
// from the browser straight to private storage, then join a background queue;
// this page keeps the queue moving while it is open and shows each file's status.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, CopyCheck, FileUp, Loader2, UploadCloud, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { queuePoolFiles, startPoolImport } from "@/app/recruiter/talent/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

type Status = "ready" | "uploading" | "queued" | "parsing" | "done" | "duplicate" | "failed" | "skipped";
type Item = {
  key: string;
  name: string;
  size: number;
  file?: Blob;
  ext?: string;
  status: Status;
  note?: string;
  path?: string;
};

const label: Record<Status, string> = {
  ready: "Ready",
  uploading: "Uploading",
  queued: "Queued",
  parsing: "Parsing",
  done: "Done",
  duplicate: "Duplicate merged",
  failed: "Failed",
  skipped: "Skipped",
};

function extOf(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

async function expand(files: File[]): Promise<Item[]> {
  const out: Item[] = [];
  for (const f of files) {
    const ext = extOf(f.name);
    if (ext === "zip") {
      if (f.size > 200 * 1024 * 1024) {
        out.push({ key: crypto.randomUUID(), name: f.name, size: f.size, status: "skipped", note: "ZIP over 200 MB" });
        continue;
      }
      const JSZip = (await import("jszip")).default;
      try {
        const zip = await JSZip.loadAsync(f);
        for (const entry of Object.values(zip.files)) {
          const base = entry.name.split("/").pop() ?? entry.name;
          if (entry.dir || entry.name.startsWith("__MACOSX") || base.startsWith(".")) continue;
          const e = extOf(base);
          if (!MIME[e]) {
            out.push({ key: crypto.randomUUID(), name: base, size: 0, status: "skipped", note: "not a PDF or DOCX" });
            continue;
          }
          const blob = new File([await entry.async("arraybuffer")], base, { type: MIME[e] });
          out.push(
            check({ key: crypto.randomUUID(), name: base, size: blob.size, file: blob, ext: e, status: "ready" }),
          );
        }
      } catch {
        out.push({
          key: crypto.randomUUID(),
          name: f.name,
          size: f.size,
          status: "skipped",
          note: "could not open ZIP",
        });
      }
      continue;
    }
    out.push(check({ key: crypto.randomUUID(), name: f.name, size: f.size, file: f, ext, status: "ready" }));
  }
  return out;
}

function check(i: Item): Item {
  if (!i.ext || !MIME[i.ext]) return { ...i, status: "skipped", note: "not a PDF or DOCX", file: undefined };
  if (i.size > MAX_BYTES) return { ...i, status: "skipped", note: "larger than 5 MB", file: undefined };
  if (i.size === 0) return { ...i, status: "skipped", note: "empty file", file: undefined };
  return i;
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

export function PoolUploader({ batchCap, room, pending }: { batchCap: number; room: number; pending: number }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lawful, setLawful] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const processing = useRef(false);

  const patch = (key: string, p: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const add = useCallback(async (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    setMessage(null);
    const expanded = await expand(Array.from(list));
    setItems((xs) => [...xs.filter((x) => x.status === "ready" || x.status === "skipped"), ...expanded]);
  }, []);

  /** Keep calling the worker until this workspace's queue is empty. */
  const runQueue = useCallback(async () => {
    if (processing.current) return;
    processing.current = true;
    try {
      for (let round = 0; round < 200; round++) {
        const res = await fetch("/api/pool/process", { method: "POST" });
        if (!res.ok) break;
        const data = (await res.json()) as {
          remaining: number;
          files: { storage_path: string; status: Status; error: string | null }[];
        };
        const byPath = new Map(data.files.map((f) => [f.storage_path, f]));
        setItems((xs) =>
          xs.map((x) => {
            const f = x.path ? byPath.get(x.path) : undefined;
            return f ? { ...x, status: f.status, note: f.error ?? undefined } : x;
          }),
        );
        if (!data.remaining) break;
      }
    } finally {
      processing.current = false;
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    if (pending > 0) void runQueue();
  }, [pending, runQueue]);

  async function upload() {
    const ready = items.filter((i) => i.status === "ready" && i.file);
    if (!ready.length) return setMessage({ tone: "error", text: "Add at least one PDF or DOCX file." });
    if (!lawful)
      return setMessage({ tone: "error", text: "Please confirm you are allowed to add these resumes to Vouch." });
    if (ready.length > batchCap)
      return setMessage({
        tone: "error",
        text: `Upload at most ${batchCap} files at a time (you have ${ready.length}).`,
      });
    setBusy(true);
    setMessage(null);
    try {
      const start = await startPoolImport(ready.length, lawful);
      if (!start.ok) return setMessage({ tone: "error", text: start.error });
      const supabase = createClient();
      const uploaded: { storage_path: string; original_filename: string; size_bytes: number }[] = [];
      await pool(ready, 4, async (it) => {
        const path = `pool/${start.workspaceId}/${start.importId}/${crypto.randomUUID()}.${it.ext}`;
        patch(it.key, { status: "uploading", path });
        const { error } = await supabase.storage
          .from("resumes")
          .upload(path, it.file!, { contentType: MIME[it.ext!], upsert: false });
        if (error) return patch(it.key, { status: "failed", note: "upload failed, try again" });
        uploaded.push({ storage_path: path, original_filename: it.name, size_bytes: it.size });
        patch(it.key, { status: "queued", file: undefined });
      });
      for (let i = 0; i < uploaded.length; i += 100) {
        const q = await queuePoolFiles(start.importId, uploaded.slice(i, i + 100));
        if (!q.ok) return setMessage({ tone: "error", text: q.error ?? "Could not queue the files." });
      }
      await runQueue();
      setItems((xs) => {
        const n = (s: Status) => xs.filter((x) => x.status === s).length;
        setMessage({
          tone: n("failed") ? "error" : "ok",
          text: `Added ${n("done")} profile${n("done") === 1 ? "" : "s"}. ${n("duplicate") ? `${n("duplicate")} duplicate${n("duplicate") === 1 ? "" : "s"} merged. ` : ""}${n("failed") ? `${n("failed")} failed (see reasons below).` : ""}`.trim(),
        });
        return xs;
      });
    } finally {
      setBusy(false);
    }
  }

  const ready = items.filter((i) => i.status === "ready").length;
  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void add(e.dataTransfer.files);
        }}
        className={cn(
          "border-border bg-muted/40 flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          over && "border-primary bg-primary-soft",
        )}
      >
        <UploadCloud className="text-primary h-10 w-10" aria-hidden />
        <div>
          <p className="font-medium">Drag and drop resumes here</p>
          <p className="text-muted-foreground text-sm">
            PDF or DOCX, or one ZIP of them. Up to {batchCap} files, 5 MB each. Room in your pool: {room}.
          </p>
        </div>
        <label htmlFor="resumes" className="text-primary cursor-pointer text-sm font-medium underline">
          Resume files
        </label>
        <input
          ref={inputRef}
          id="resumes"
          type="file"
          multiple
          accept=".pdf,.docx,.zip,application/pdf,application/zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="text-sm"
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="border-border rounded-2xl border">
          <div className="border-border flex items-center justify-between border-b px-4 py-2 text-sm">
            <span>
              {items.length} file{items.length === 1 ? "" : "s"}
              {ready ? ` · ${ready} ready` : ""}
            </span>
            {!busy && (
              <Button variant="ghost" size="sm" onClick={() => setItems([])}>
                <X className="h-4 w-4" aria-hidden /> Clear
              </Button>
            )}
          </div>
          <ul className="divide-border max-h-80 divide-y overflow-y-auto text-sm" aria-live="polite">
            {items.map((it) => (
              <li key={it.key} className="flex items-center gap-3 px-4 py-2">
                <StatusIcon status={it.status} />
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    it.status === "failed" || it.status === "skipped"
                      ? "text-red-700 dark:text-red-300"
                      : "text-muted-foreground",
                  )}
                >
                  {label[it.status]}
                  {it.note ? `: ${it.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={lawful} onChange={(e) => setLawful(e.target.checked)} />
        <span>
          These people gave us their resume for job opportunities, and we may add it to Vouch. (Recorded in the audit
          log.)
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={upload} disabled={busy || !ready}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />}
          {busy ? "Working…" : "Upload"}
        </Button>
        {message && (
          <p
            role="status"
            className={cn(
              "text-sm",
              message.tone === "error" ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300",
            )}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />;
  if (status === "duplicate") return <CopyCheck className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />;
  if (status === "failed" || status === "skipped")
    return <CircleAlert className="h-4 w-4 shrink-0 text-red-600" aria-hidden />;
  if (status === "ready") return <FileUp className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />;
  return <Loader2 className="text-primary h-4 w-4 shrink-0 animate-spin" aria-hidden />;
}
