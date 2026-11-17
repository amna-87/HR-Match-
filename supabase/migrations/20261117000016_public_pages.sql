-- G1 + 7c: readable job URLs, usage counters, saved jobs. See D-032.

-- Stable, readable job URLs: /jobs/<title>-<city>-<number>
create sequence if not exists public.jobs_public_number_seq start 1001;
alter table public.jobs add column public_number bigint not null default nextval('public.jobs_public_number_seq');
alter sequence public.jobs_public_number_seq owned by public.jobs.public_number;
create unique index jobs_public_number_idx on public.jobs(public_number);
grant select (public_number) on public.jobs to anon;

-- Same rule as slugify() in src/lib/slug.ts
create or replace function public.slugify(p text) returns text
language sql immutable as $$
  select left(trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g')), 60)
$$;

-- Usage counters for plans (G1): what a workspace has used against its limits.
create or replace function public.workspace_usage(p_workspace_id uuid)
returns table (pool_size integer, pool_cap integer, messages_today integer, daily_send_cap integer,
  messages_30d integer, sources integer, source_cap integer, intros_30d integer, open_jobs integer, plan text)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from public.pool_candidates where workspace_id = c.id), c.pool_cap,
    (select count(*)::int from public.outreach_log where workspace_id = c.id and created_at > now() - interval '1 day'),
    c.daily_send_cap,
    (select count(*)::int from public.outreach_log where workspace_id = c.id and created_at > now() - interval '30 days'),
    (select count(*)::int from public.job_feeds where workspace_id = c.id), c.source_cap,
    (select count(*)::int from public.intro_requests where requesting_workspace_id = c.id and created_at > now() - interval '30 days'),
    (select count(*)::int from public.jobs where owner_workspace_id = c.id and status = 'published'),
    c.plan
  from public.companies c
  where c.id = p_workspace_id and (public.is_company_member(c.id) or public.is_platform_admin())
$$;
revoke execute on function public.workspace_usage(uuid) from public, anon;
grant execute on function public.workspace_usage(uuid) to authenticated;

-- Saved jobs (needs login, 7c)
create table public.saved_jobs (
  user_id uuid not null references public.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
alter table public.saved_jobs enable row level security;
create policy saved_jobs_own on public.saved_jobs for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.jobs j where j.id = job_id));
grant select, insert, delete on public.saved_jobs to authenticated;
grant all on public.saved_jobs to service_role;

-- 7c: "Apply through Vouch on an employer-posted job" (needs login). The
-- candidate's own click is the consent: we create/refresh their match and run
-- it through respond_to_match('approve'), the ONLY path that creates
-- applications (rule 1), so the consent event is recorded as usual.
create or replace function public.apply_to_job(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_cand uuid := public.my_candidate_id(); j public.jobs; c public.candidates; m public.matches; v_score numeric;
begin
  if v_cand is null then raise exception 'only candidate accounts can apply' using errcode = '42501'; end if;
  select * into j from public.jobs where id = p_job_id;
  if j.id is null or j.source_type <> 'verified' or j.visibility <> 'public' or j.status <> 'published'
     or (j.expires_at is not null and j.expires_at <= now()) then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  select * into m from public.matches where job_id = j.id and candidate_id = v_cand for update;
  if m.id is null then
    select * into c from public.candidates where id = v_cand;
    v_score := case when c.embedding is not null and j.embedding is not null
                    then round(greatest(0, least(100, 100 * (1 - (c.embedding <=> j.embedding))))::numeric, 2) else 50 end;
    insert into public.matches(job_id, candidate_id, score, explanation)
    values (j.id, v_cand, v_score, 'Applied directly on Vouch.') returning * into m;
  end if;
  if m.status in ('approved', 'applied') then return jsonb_build_object('status', m.status, 'idempotent', true); end if;
  if m.status in ('declined', 'expired', 'viewed') then
    raise exception 'you already answered this job (%)', m.status using errcode = 'P0001';
  end if;
  if m.status = 'suggested' then
    update public.matches set status = 'notified', notified_at = now(), expires_at = now() + interval '1 day' where id = m.id;
  end if;
  return public.respond_to_match(m.id, 'approve');
end $$;
revoke execute on function public.apply_to_job(uuid) from public, anon;
grant execute on function public.apply_to_job(uuid) to authenticated;
