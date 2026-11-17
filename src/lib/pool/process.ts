// Background processing of bulk talent-pool uploads (A2, D-027).
// Files are claimed from pool_import_files with SKIP LOCKED, so several workers
// (the open upload page, cron) never process the same file. Every file is
// handled in its own try/catch: a failure never blocks other files. Failed
// files are retried up to MAX_ATTEMPTS times, then marked failed with a reason.
import type { Queryable } from "@/lib/db";
import type { EmbeddingProvider } from "@/lib/matching/embeddings";
import { textHash, toPgVector } from "@/lib/matching/embeddings";
import { candidateEmbeddingText } from "@/lib/matching/sanitize";
import { validateResumeFile, type ResumeKind } from "@/lib/parsing/extract-text";
import type { ParsedResume } from "@/lib/parsing/schemas";

export const MAX_ATTEMPTS = 3;
const STALE_LOCK = "5 minutes";

export interface ParsedForPool {
  parsed: ParsedResume;
  years: number;
  by: "ai" | "basic";
}

export interface PoolProcessDeps {
  db: Queryable;
  embedder: EmbeddingProvider;
  download(path: string): Promise<Uint8Array>;
  remove(paths: string[]): Promise<void>;
  extract(kind: ResumeKind, bytes: Uint8Array): Promise<string>;
  parse(text: string): Promise<ParsedForPool>;
}

/** Thrown for problems retrying can't fix (bad file, no text). */
export class PermanentFileError extends Error {}

type FileRow = {
  id: string;
  workspace_id: string;
  import_id: string;
  original_filename: string;
  storage_path: string;
  attempts: number;
  created_by: string | null;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function poolRowFromParsed(p: ParsedForPool) {
  const r = p.parsed;
  const latest = r.experiences.find((e) => e.is_current) ?? r.experiences[0];
  const clean = (s: string | null | undefined, n = 300) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n) || null;
  return {
    full_name: clean(r.full_name, 200),
    headline: clean(r.headline, 200),
    summary: clean(r.summary, 3000),
    location: clean(r.location, 200),
    contact_email: EMAIL_RE.test((r.email ?? "").trim()) ? r.email.trim().toLowerCase() : null,
    contact_phone: clean(r.phone, 50),
    latest_title: clean(latest?.title, 200),
    latest_employer: clean(latest?.company, 200),
    experience_years: Math.max(0, Math.min(60, Math.round((p.years || 0) * 10) / 10)),
    skills: [...new Set(r.skills.map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 100),
    languages: r.languages.slice(0, 20),
    experiences: r.experiences.slice(0, 30),
    education: r.education.slice(0, 20),
    certifications: r.certifications.slice(0, 30),
    parsed_by: p.by,
  };
}

/** Claim up to `limit` queued files (optionally for one workspace); stale locks are re-queued. */
async function claim(db: Queryable, limit: number, workspaceId?: string): Promise<FileRow[]> {
  await db.query(
    `update public.pool_import_files set status = 'queued', locked_at = null
     where status = 'parsing' and locked_at < now() - interval '${STALE_LOCK}'`,
  );
  const r = await db.query<FileRow>(
    `with next as (
       select f.id from public.pool_import_files f
       where f.status = 'queued' and ($2::uuid is null or f.workspace_id = $2)
       order by f.created_at limit $1 for update skip locked)
     update public.pool_import_files f set status = 'parsing', locked_at = now(), attempts = f.attempts + 1
     from next, public.pool_imports i
     where f.id = next.id and i.id = f.import_id
     returning f.id, f.workspace_id, f.import_id, f.original_filename, f.storage_path, f.attempts, i.created_by`,
    [limit, workspaceId ?? null],
  );
  return r.rows;
}

/** Find an existing profile in the same workspace: email, then phone, then name + latest employer. */
async function findDuplicate(db: Queryable, ws: string, row: ReturnType<typeof poolRowFromParsed>) {
  const r = await db.query<{ id: string; key: string }>(
    `select id, case when email_norm = lower($2) then 'email'
                     when phone_norm = right(regexp_replace(coalesce($3, ''), '\\D', '', 'g'), 10) then 'phone'
                     else 'name and employer' end as key
     from public.pool_candidates
     where workspace_id = $1 and (
       ($2::text is not null and email_norm = lower($2))
       or (length(regexp_replace(coalesce($3, ''), '\\D', '', 'g')) >= 7
           and phone_norm = right(regexp_replace(coalesce($3, ''), '\\D', '', 'g'), 10))
       or ($4::text is not null and $5::text is not null
           and name_employer_norm = lower(regexp_replace(btrim($4), '\\s+', ' ', 'g')) || '|' || lower(regexp_replace(btrim($5), '\\s+', ' ', 'g'))))
     order by (email_norm = lower(coalesce($2, ''))) desc, created_at limit 1`,
    [ws, row.contact_email, row.contact_phone, row.full_name, row.latest_employer],
  );
  return r.rows[0] ?? null;
}

type Prepared = { row: ReturnType<typeof poolRowFromParsed>; mime: string; size: number };

/** Download, read and parse one file (slow part; runs in parallel). */
async function prepare(deps: PoolProcessDeps, f: FileRow): Promise<Prepared> {
  const bytes = await deps.download(f.storage_path);
  const v = validateResumeFile(f.original_filename, bytes);
  if (!v.ok) throw new PermanentFileError(v.error);
  let text: string;
  try {
    text = await deps.extract(v.kind, bytes);
  } catch {
    throw new PermanentFileError("could not read the file");
  }
  if (text.trim().length < 50) throw new PermanentFileError("no readable text (scanned image?)");
  return { row: poolRowFromParsed(await deps.parse(text)), mime: v.mime, size: bytes.byteLength };
}

/** De-duplicate and save (runs one file at a time so a batch can't double-insert the same person). */
async function commit(deps: PoolProcessDeps, f: FileRow, { row, mime, size }: Prepared): Promise<"done" | "duplicate"> {
  const dup = await findDuplicate(deps.db, f.workspace_id, row);
  if (dup) {
    // Merge: fill blanks and add new skills; the existing resume file is kept.
    await deps.db.query(
      `update public.pool_candidates set
         full_name = coalesce(full_name, $2), headline = coalesce(headline, $3), summary = coalesce(summary, $4),
         location = coalesce(location, $5), contact_email = coalesce(contact_email, $6), contact_phone = coalesce(contact_phone, $7),
         latest_title = coalesce(latest_title, $8), latest_employer = coalesce(latest_employer, $9),
         experience_years = greatest(experience_years, $10),
         skills = (select coalesce(array_agg(distinct s), '{}') from unnest(skills || $11::text[]) s),
         experiences = case when jsonb_array_length(experiences) = 0 then $12::jsonb else experiences end
       where id = $1`,
      [
        dup.id,
        row.full_name,
        row.headline,
        row.summary,
        row.location,
        row.contact_email,
        row.contact_phone,
        row.latest_title,
        row.latest_employer,
        row.experience_years,
        row.skills,
        JSON.stringify(row.experiences),
      ],
    );
    await deps.db.query(
      `update public.pool_import_files set status = 'duplicate', pool_candidate_id = $2, locked_at = null,
         error = $3 where id = $1`,
      [f.id, dup.id, `same person as an existing profile (matched on ${dup.key}); merged`],
    );
    await deps.remove([f.storage_path]);
    await refreshPoolEmbeddings(deps, [dup.id]);
    return "duplicate";
  }
  const ins = await deps.db.query<{ id: string }>(
    `insert into public.pool_candidates(workspace_id, full_name, headline, summary, location, contact_email, contact_phone,
       latest_title, latest_employer, experience_years, skills, languages, experiences, education, certifications,
       storage_path, original_filename, mime_type, size_bytes, parsed_by, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,$17,$18,$19,$20,$21)
     returning id`,
    [
      f.workspace_id,
      row.full_name,
      row.headline,
      row.summary,
      row.location,
      row.contact_email,
      row.contact_phone,
      row.latest_title,
      row.latest_employer,
      row.experience_years,
      row.skills,
      row.languages,
      JSON.stringify(row.experiences),
      JSON.stringify(row.education),
      JSON.stringify(row.certifications),
      f.storage_path,
      f.original_filename,
      mime,
      size,
      row.parsed_by,
      f.created_by,
    ],
  );
  const id = ins.rows[0].id;
  await deps.db.query(
    "update public.pool_import_files set status = 'done', pool_candidate_id = $2, locked_at = null, error = null where id = $1",
    [f.id, id],
  );
  await refreshPoolEmbeddings(deps, [id]);
  return "done";
}

export interface ProcessResult {
  processed: number;
  done: number;
  duplicates: number;
  failed: number;
  retrying: number;
  remaining: number;
}

/** Process queued files until the queue is empty or the time budget is used. */
export async function processPoolQueue(
  deps: PoolProcessDeps,
  opts: { workspaceId?: string; budgetMs?: number; batch?: number } = {},
): Promise<ProcessResult> {
  const until = Date.now() + (opts.budgetMs ?? 40_000);
  const res: ProcessResult = { processed: 0, done: 0, duplicates: 0, failed: 0, retrying: 0, remaining: 0 };
  while (Date.now() < until) {
    const files = await claim(deps.db, opts.batch ?? 3, opts.workspaceId);
    if (!files.length) break;
    const prepared = await Promise.allSettled(files.map((f) => prepare(deps, f)));
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      res.processed++;
      try {
        const p = prepared[i];
        if (p.status === "rejected") throw p.reason;
        const out = await commit(deps, f, p.value);
        if (out === "done") res.done++;
        else res.duplicates++;
      } catch (e) {
        const permanent = e instanceof PermanentFileError;
        const full = /pool is full/i.test(String((e as Error)?.message));
        const giveUp = permanent || full || f.attempts >= MAX_ATTEMPTS;
        const reason = permanent || full ? (e as Error).message : "processing failed, please re-upload";
        if (!permanent && !full) console.error("[pool] file failed", f.id, e);
        await deps.db.query(
          "update public.pool_import_files set status = $2, locked_at = null, error = $3 where id = $1",
          [
            f.id,
            giveUp ? "failed" : "queued",
            giveUp ? reason : `retrying (${(e as Error)?.message ?? "error"})`.slice(0, 300),
          ],
        );
        if (giveUp) {
          res.failed++;
          await deps.remove([f.storage_path]).catch(() => {});
        } else res.retrying++;
      }
    }
  }
  res.remaining = Number(
    (
      await deps.db.query<{ n: number }>(
        "select count(*)::int n from public.pool_import_files where status in ('queued','parsing') and ($1::uuid is null or workspace_id = $1)",
        [opts.workspaceId ?? null],
      )
    ).rows[0].n,
  );
  return res;
}

/** Embeddings for pool profiles, built from sanitized profile text only (rule 5). */
export async function refreshPoolEmbeddings(
  deps: Pick<PoolProcessDeps, "db" | "embedder">,
  ids: string[],
): Promise<number> {
  if (!ids.length) return 0;
  const r = await deps.db.query<{
    id: string;
    headline: string | null;
    summary: string | null;
    skills: string[];
    experiences: { title?: string; description?: string | null }[];
    certifications: { name?: string }[];
    embedding_hash: string | null;
    has_embedding: boolean;
  }>(
    `select id, headline, summary, skills, experiences, certifications, embedding_hash, embedding is not null has_embedding
     from public.pool_candidates where id = any($1::uuid[])`,
    [ids],
  );
  const todo: { id: string; text: string; hash: string }[] = [];
  for (const row of r.rows) {
    const text = candidateEmbeddingText({
      headline: row.headline,
      summary: row.summary,
      skills: row.skills ?? [],
      experiences: (row.experiences ?? [])
        .filter((e) => e?.title)
        .map((e) => ({ title: String(e.title), description: e.description ?? null })),
      certifications: (row.certifications ?? []).map((c) => String(c?.name ?? "")).filter(Boolean),
    });
    const hash = textHash(deps.embedder.name, text);
    if (row.has_embedding && row.embedding_hash === hash) continue;
    todo.push({ id: row.id, text, hash });
  }
  if (!todo.length) return 0;
  const vectors = await deps.embedder.embed(
    todo.map((t) => t.text),
    "document",
  );
  for (let i = 0; i < todo.length; i++)
    await deps.db.query(
      "update public.pool_candidates set embedding = $2::extensions.vector, embedding_hash = $3 where id = $1",
      [todo[i].id, toPgVector(vectors[i]), todo[i].hash],
    );
  return todo.length;
}
