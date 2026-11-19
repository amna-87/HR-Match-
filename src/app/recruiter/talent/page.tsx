import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, Sparkles } from "lucide-react";
import { requireRecruiter } from "@/lib/auth/session";
import { engineDeps } from "@/lib/server/context";
import { prepareJobForRanking } from "@/lib/matching/engine";
import { scoreMatch } from "@/lib/matching/scoring";
import { getEmbeddingProvider, toPgVector } from "@/lib/matching/embeddings";
import { stripProtectedCharacteristics } from "@/lib/matching/sanitize";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Flash } from "@/components/flash";
import { PoolUploader } from "@/components/pool-uploader";
import { POOL_STATUS_LABELS } from "@/lib/pool/labels";
import { setPoolStatus } from "./actions";
import { answerIntroAsOwner } from "../introductions/actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Talent pool" };

type PoolRow = {
  id: string;
  full_name: string | null;
  headline: string | null;
  location: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  latest_title: string | null;
  latest_employer: string | null;
  experience_years: number;
  skills: string[];
  tags: string[];
  status: keyof typeof POOL_STATUS_LABELS;
  do_not_contact: boolean;
  claimed: boolean;
  created_at: string;
  similarity: number | null;
  total: number;
};

type RankRow = {
  candidate_id: string;
  is_own: boolean;
  similarity: number;
  full_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  headline: string | null;
  location: string | null;
  experience_years: number;
  skills: string[];
};

const PAGE = 50;

export default async function TalentPoolPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, company } = await requireRecruiter();
  if (!company) redirect("/recruiter");
  const ws = company as unknown as { id: string; pool_cap: number; batch_file_cap: number };
  const page = Math.max(0, Number(sp.page) || 0);

  // Semantic search: embed the description (protected characteristics stripped first).
  const ask = (sp.ask ?? "").trim().slice(0, 300);
  let queryEmbedding: string | null = null;
  if (ask) {
    const [v] = await getEmbeddingProvider().embed([stripProtectedCharacteristics(ask)], "query");
    queryEmbedding = toPgVector(v);
  }
  const skills = (sp.skills ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [{ data: rows, error: searchError }, { count: poolCount }, { count: pending }, { data: jobs }, { data: tags }] =
    await Promise.all([
      supabase.rpc("search_pool", {
        p_workspace_id: ws.id,
        p_text: sp.q || null,
        p_skills: skills.length ? skills : null,
        p_title: sp.title || null,
        p_location: sp.location || null,
        p_min_exp: sp.min_exp ? Number(sp.min_exp) : null,
        p_tag: sp.tag || null,
        p_status: sp.status || null,
        p_query_embedding: queryEmbedding,
        p_limit: PAGE,
        p_offset: page * PAGE,
      }),
      supabase.from("pool_candidates").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id),
      supabase
        .from("pool_import_files")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws.id)
        .in("status", ["queued", "parsing"]),
      supabase
        .from("jobs")
        .select("id, title, status")
        .eq("company_id", ws.id)
        .in("status", ["published", "draft", "paused"])
        .order("created_at", { ascending: false }),
      supabase.from("pool_candidates").select("tags").eq("workspace_id", ws.id).neq("tags", "{}").limit(1000),
    ]);
  const { data: introData } = await supabase.rpc("introductions_for_my_pool", { p_workspace_id: ws.id });
  const intros = (
    (introData ?? []) as {
      id: string;
      status: string;
      message: string | null;
      pool_candidate_id: string;
      person: string;
      job_title: string;
      requesting_company: string;
    }[]
  ).filter((i) => i.status === "waiting_owner");
  const list = (rows ?? []) as PoolRow[];
  const total = list[0]?.total ?? 0;
  const allTags = [...new Set((tags ?? []).flatMap((t) => t.tags as string[]))].sort();
  const filtered = Boolean(sp.q || sp.skills || sp.title || sp.location || sp.min_exp || sp.tag || sp.status || ask);

  // Ranked pool for one of our jobs (own pool in full; shared network pools anonymous).
  const jobId = (jobs ?? []).some((j) => j.id === sp.job) ? sp.job : null;
  let ranked: (RankRow & { score: number })[] = [];
  if (jobId) {
    const deps = engineDeps();
    const job = await prepareJobForRanking(deps, jobId);
    const { data } = await supabase.rpc("talent_pool_for_job", { p_job_id: jobId, p_limit: 50 });
    if (job)
      ranked = ((data ?? []) as RankRow[])
        .map((r) => ({
          ...r,
          score: scoreMatch(
            job,
            {
              id: r.candidate_id,
              experience_years: Number(r.experience_years) || 0,
              skills: r.skills.map((s) => ({ skill: s, source: "parsed" as const, domain: null })),
              optedInDomains: [],
            },
            Number(r.similarity),
            deps.embedder.name,
          ).score,
        }))
        .sort((a, b) => b.score - a.score);
  }

  const qs = (extra: Record<string, string | number>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra }))
      if (v !== "" && v != null && !["ok", "error"].includes(k)) u.set(k, String(v));
    return `?${u.toString()}`;
  };

  return (
    <div className="space-y-6">
      <Flash searchParams={sp} />
      <PageHeader
        title="Talent pool"
        description={
          <>
            Resumes you add are private to your workspace. Nobody else sees them unless you turn on anonymous sharing in{" "}
            <Link href="/recruiter/company" className="text-primary underline">
              workspace settings
            </Link>
            , and even then only a card without the name, contact details or file. We never email these people.
          </>
        }
        actions={
          <p className="border-border bg-card text-muted-foreground rounded-xl border px-4 py-2 text-sm shadow-(--shadow-card)">
            <span className="text-foreground text-2xl font-semibold tabular-nums">{poolCount ?? 0}</span> /{" "}
            {ws.pool_cap} profiles
          </p>
        }
      />

      {intros.length > 0 && (
        <Card className="border-sky-300">
          <CardHeader>
            <CardTitle>Introduction requests ({intros.length})</CardTitle>
            <CardDescription>
              Another recruiter would like to meet someone from your pool. Ask the person (outside Vouch). Their details
              are shared only if they agree.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-border divide-y">
              {intros.map((i) => (
                <li key={i.id} className="space-y-2 py-3">
                  <p className="text-sm">
                    <strong>{i.requesting_company}</strong> asks about{" "}
                    <Link href={`/recruiter/talent/${i.pool_candidate_id}`} prefetch={false} className="underline">
                      {i.person}
                    </Link>{" "}
                    for <strong>{i.job_title}</strong>.
                  </p>
                  {i.message && <p className="text-muted-foreground text-sm italic">&ldquo;{i.message}&rdquo;</p>}
                  <div className="flex flex-wrap items-center gap-3">
                    <form action={answerIntroAsOwner} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="decision" value="agreed" />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="lawful_basis" required /> The person agreed to share their resume
                        with this recruiter
                      </label>
                      <Button size="sm">They agreed</Button>
                    </form>
                    <form action={answerIntroAsOwner}>
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="decision" value="declined" />
                      <Button size="sm" variant="outline">
                        They said no
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add resumes</CardTitle>
          <CardDescription>
            Files are read in the background. You can keep working; failed files show the reason and never block the
            others.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PoolUploader
            batchCap={ws.batch_file_cap}
            room={Math.max(0, ws.pool_cap - (poolCount ?? 0) - (pending ?? 0))}
            pending={pending ?? 0}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search your pool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form method="get" className="space-y-3">
            <div className="border-border bg-background flex items-center gap-2 rounded-2xl border p-1.5">
              <Sparkles className="text-primary ml-2 h-5 w-5 shrink-0" aria-hidden />
              <label htmlFor="ask" className="sr-only">
                Describe who you are looking for
              </label>
              <input
                id="ask"
                name="ask"
                defaultValue={ask}
                placeholder='Describe who you need, e.g. "social media marketer with Meta Ads"'
                className="placeholder:text-muted-foreground h-10 min-w-0 flex-1 bg-transparent outline-none"
              />
              <SubmitButton size="sm">
                <Search className="h-4 w-4" aria-hidden /> Search
              </SubmitButton>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <Field label="Keyword" htmlFor="q">
                <Input id="q" name="q" defaultValue={sp.q ?? ""} />
              </Field>
              <Field label="Skills" htmlFor="skills" hint="comma separated">
                <Input id="skills" name="skills" defaultValue={sp.skills ?? ""} />
              </Field>
              <Field label="Title" htmlFor="title">
                <Input id="title" name="title" defaultValue={sp.title ?? ""} />
              </Field>
              <Field label="Location" htmlFor="location">
                <Input id="location" name="location" defaultValue={sp.location ?? ""} />
              </Field>
              <Field label="Min. years" htmlFor="min_exp">
                <Input id="min_exp" name="min_exp" type="number" min={0} max={60} defaultValue={sp.min_exp ?? ""} />
              </Field>
              <Field label="Tag" htmlFor="tag">
                <Select id="tag" name="tag" defaultValue={sp.tag ?? ""}>
                  <option value="">Any</option>
                  {allTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="pstatus">
                <Select id="pstatus" name="status" defaultValue={sp.status ?? ""}>
                  <option value="">Any</option>
                  {Object.entries(POOL_STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {filtered && (
              <Link href="/recruiter/talent" className="text-sm underline">
                Clear search
              </Link>
            )}
          </form>

          {searchError && <p className="text-sm text-red-700">{searchError.message}</p>}
          <p className="text-muted-foreground text-sm">
            {total} {filtered ? "matching " : ""}profile{total === 1 ? "" : "s"}
            {ask ? ", best matches first" : ""}
          </p>
          {list.length ? (
            <ul className="divide-border divide-y">
              {list.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <Link href={`/recruiter/talent/${r.id}`} prefetch={false} className="hover:underline">
                        {r.full_name || "Unnamed profile"}
                      </Link>
                      {r.do_not_contact && <Badge tone="danger">Do not contact</Badge>}
                      {r.claimed && <Badge tone="success">On Vouch</Badge>}
                      {r.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {[
                        r.headline || r.latest_title,
                        r.latest_employer,
                        r.location,
                        `${Number(r.experience_years) || 0} yrs`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="text-xs">{r.skills.slice(0, 12).join(", ")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.similarity != null && (
                      <Badge tone="info">{Math.round(Number(r.similarity) * 100)}% similar</Badge>
                    )}
                    <form action={setPoolStatus} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <label htmlFor={`st-${r.id}`} className="sr-only">
                        Status for {r.full_name || "this profile"}
                      </label>
                      <select
                        id={`st-${r.id}`}
                        name="status"
                        defaultValue={r.status}
                        className="border-border bg-background h-9 rounded-lg border px-2 text-sm"
                      >
                        {Object.entries(POOL_STATUS_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <SubmitButton size="sm" variant="ghost">
                        Set
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              {filtered ? "No profiles match this search." : "No resumes uploaded yet."}
            </p>
          )}
          {total > PAGE && (
            <div className="flex gap-2">
              {page > 0 && (
                <Link href={qs({ page: page - 1 })} className={buttonClasses("outline", "sm")}>
                  Previous
                </Link>
              )}
              {(page + 1) * PAGE < total && (
                <Link href={qs({ page: page + 1 })} className={buttonClasses("outline", "sm")}>
                  Next
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Find people for a job</CardTitle>
          <CardDescription>
            Ranks your pool, and pools shared with the Vouch network, against one of your jobs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(jobs ?? []).length ? (
            <form method="get" className="flex flex-wrap items-end gap-2">
              <Field label="Job" htmlFor="job">
                <Select id="job" name="job" defaultValue={jobId ?? ""}>
                  {(jobs ?? []).map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({j.status})
                    </option>
                  ))}
                </Select>
              </Field>
              <SubmitButton variant="outline">Rank</SubmitButton>
            </form>
          ) : (
            <p className="text-muted-foreground text-sm">
              <Link href="/recruiter/jobs/new" className="underline">
                Post a job
              </Link>{" "}
              to rank the pool against it.
            </p>
          )}
          {jobId && !ranked.length && <p className="text-muted-foreground text-sm">No profiles in the pool yet.</p>}
          {ranked.length > 0 && (
            <ul className="divide-border divide-y">
              {ranked.map((r) => (
                <li key={r.candidate_id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      {r.is_own ? (
                        <Link href={`/recruiter/talent/${r.candidate_id}`} prefetch={false} className="hover:underline">
                          {r.full_name || "Unnamed profile"}
                        </Link>
                      ) : (
                        <span>Anonymous profile</span>
                      )}{" "}
                      {r.is_own ? <Badge tone="info">Your pool</Badge> : <Badge>Vouch network</Badge>}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {[r.headline, r.location, `${Number(r.experience_years) || 0} yrs`].filter(Boolean).join(" · ")}
                    </p>
                    {r.is_own && (r.contact_email || r.contact_phone) && (
                      <p className="text-sm">{[r.contact_email, r.contact_phone].filter(Boolean).join(" · ")}</p>
                    )}
                    <p className="text-xs">{r.skills.slice(0, 12).join(", ")}</p>
                  </div>
                  <Badge tone={r.score >= 70 ? "success" : "muted"}>{Math.round(r.score)}% fit</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
