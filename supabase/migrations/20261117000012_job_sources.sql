-- B1 (addendum section 4): optional company, contact-method rules, source
-- labels, workspace-owned sourced jobs, WhatsApp, expiry refresh, duplicates.
-- See docs/decisions.md D-028.
--
-- source_type keeps its v1.0 meaning (rule 4): 'verified' = posted by the hiring
-- company and applied to on Vouch; 'sourced' = from somewhere else, applied to
-- off-platform. The new `origin` says how the job arrived:
-- employer_posted | pasted | csv_import | api_feed | email_forwarded | manual.

alter type public.apply_method add value if not exists 'whatsapp';

alter table public.jobs
  add column origin text not null default 'employer_posted'
    check (origin in ('employer_posted', 'pasted', 'csv_import', 'api_feed', 'email_forwarded', 'manual')),
  -- the workspace that manages the job (verified: the company; sourced: the recruiter who added it; null: Vouch admins)
  add column owner_workspace_id uuid references public.companies(id) on delete cascade,
  -- 'workspace': only that workspace sees it; 'public': on the public board (admins approve sourced jobs)
  add column visibility text not null default 'public' check (visibility in ('public', 'workspace')),
  add column public_requested_at timestamptz,
  add column last_confirmed_at timestamptz;

update public.jobs set owner_workspace_id = company_id where source_type = 'verified';
update public.jobs set origin = 'manual' where source_type = 'sourced';

alter table public.jobs add constraint jobs_workspace_visibility check (visibility = 'public' or owner_workspace_id is not null);
-- Every job needs a title and one way to apply (Vouch itself for employer-posted jobs).
alter table public.jobs add constraint jobs_contact_method check (
  apply_method::text = 'platform' or (apply_target is not null and length(btrim(apply_target)) > 0)
);
-- Sourced jobs: company and source are optional; one off-platform apply method is required.
alter table public.jobs drop constraint jobs_sourced_shape;
alter table public.jobs add constraint jobs_sourced_shape check (
  source_type <> 'sourced' or (
    company_id is null
    and (source_url is null or source_url ~* '^https?://')
    and apply_method::text in ('email', 'phone', 'link', 'whatsapp')
    and apply_target is not null and length(apply_target) > 0
  )
);
create index jobs_owner_workspace_idx on public.jobs(owner_workspace_id);
create index jobs_public_requested_idx on public.jobs(public_requested_at) where public_requested_at is not null and visibility = 'workspace';

-- Guard: owner/visibility/origin are set on insert only; only admins publish to the public board.
create or replace function public.guard_jobs() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if not public.is_trusted_backend() then
    if tg_op = 'INSERT' then
      new.embedding := null; new.embedding_hash := null;
      new.created_by := auth.uid();
      if new.source_type = 'verified' then new.owner_workspace_id := new.company_id; new.visibility := 'public'; end if;
      if new.source_type = 'sourced' and not public.is_platform_admin() then
        new.visibility := 'workspace'; new.public_requested_at := null;
      end if;
    else
      if new.embedding is distinct from old.embedding or new.embedding_hash is distinct from old.embedding_hash
         or new.source_type is distinct from old.source_type or new.company_id is distinct from old.company_id
         or new.owner_workspace_id is distinct from old.owner_workspace_id or new.origin is distinct from old.origin then
        raise exception 'not allowed to change protected job fields' using errcode = '42501';
      end if;
      if new.visibility is distinct from old.visibility and not public.is_platform_admin() then
        raise exception 'only Vouch admins can put a sourced job on the public board' using errcode = '42501';
      end if;
      if old.status = 'removed' and not public.is_platform_admin() then
        raise exception 'job was removed by moderation' using errcode = '42501';
      end if;
    end if;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
    if new.source_type = 'sourced' and (new.expires_at is null or new.expires_at <= now()) then
      new.expires_at := now() + interval '30 days';
    end if;
  end if;
  -- Marketplace matching only for jobs on the public board.
  if new.status = 'published' and new.visibility = 'public' and (
       tg_op = 'INSERT' or old.status is distinct from 'published' or old.visibility is distinct from 'public'
       or (new.title, new.description_summary, new.required_skills, new.nice_skills, new.required_certifications,
           new.domains, new.min_exp, new.max_exp, new.location, new.work_mode)
          is distinct from
          (old.title, old.description_summary, old.required_skills, old.nice_skills, old.required_certifications,
           old.domains, old.min_exp, old.max_exp, old.location, old.work_mode)) then
    new.needs_matching := true;
  end if;
  return new;
end $$;

-- RLS: public board = published, not expired, public. Workspace members see and
-- manage their own jobs, including sourced jobs they added.
drop policy if exists jobs_select_published on public.jobs;
create policy jobs_select_published on public.jobs for select to anon, authenticated
  using (status = 'published' and visibility = 'public' and (expires_at is null or expires_at > now()));
drop policy if exists jobs_select_company on public.jobs;
create policy jobs_select_company on public.jobs for select to authenticated
  using (public.is_company_member(company_id) or public.is_company_member(owner_workspace_id) or public.is_platform_admin());
drop policy if exists jobs_insert_company on public.jobs;
create policy jobs_insert_company on public.jobs for insert to authenticated
  with check (
    (source_type = 'verified' and public.is_company_member(company_id))
    or (source_type = 'sourced' and public.is_company_member(owner_workspace_id))
  );
drop policy if exists jobs_update_company on public.jobs;
create policy jobs_update_company on public.jobs for update to authenticated
  using (
    (source_type = 'verified' and public.is_company_member(company_id))
    or (source_type = 'sourced' and public.is_company_member(owner_workspace_id))
  )
  with check (
    (source_type = 'verified' and public.is_company_member(company_id))
    or (source_type = 'sourced' and public.is_company_member(owner_workspace_id))
  );

-- The workspace that manages a job (for pool ranking and job tools).
create or replace function public.job_workspace_id(p_job_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(owner_workspace_id, company_id) from public.jobs where id = p_job_id
$$;

-- "Still open?": the managing workspace (or an admin) confirms the job is open,
-- extending it by 30 days (and re-opening it if it had expired).
create or replace function public.confirm_job_open(p_job_id uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare j public.jobs; v_until timestamptz := now() + interval '30 days';
begin
  select * into j from public.jobs where id = p_job_id for update;
  if j.id is null or not (public.is_company_member(coalesce(j.owner_workspace_id, j.company_id)) or public.is_platform_admin()) then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if j.status not in ('published', 'expired', 'paused') then
    raise exception 'only open or expired jobs can be confirmed' using errcode = '22023';
  end if;
  update public.jobs set expires_at = v_until, last_confirmed_at = now(),
         status = case when status = 'expired' then 'published'::public.job_status else status end
  where id = j.id;
  perform public.write_audit('job.confirmed_open', 'jobs', j.id, jsonb_build_object('until', v_until));
  return v_until;
end $$;

-- A recruiter asks for a sourced job of theirs to go on the public board (admins approve).
create or replace function public.request_job_public(p_job_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id;
  if j.id is null or j.source_type <> 'sourced' or not public.is_company_member(j.owner_workspace_id) then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  update public.jobs set public_requested_at = now() where id = j.id and visibility = 'workspace';
  perform public.write_audit('job.public_requested', 'jobs', j.id, '{}'::jsonb);
end $$;

-- Duplicate check scoped to what the caller may see: the public board plus one
-- workspace's own jobs (never other workspaces' private jobs). Service only.
create or replace function public.find_similar_jobs(
  p_title text, p_company text, p_location text, p_summary text, p_workspace_id uuid, p_exclude uuid default null
) returns table (job_id uuid, title text, company text, location text, similarity real)
language sql stable security definer set search_path = public, extensions as $$
  select j.id, j.title, coalesce(j.source_company_name, co.name), j.location,
         extensions.similarity(lower(j.title || ' ' || coalesce(j.description_summary, '')), lower(p_title || ' ' || coalesce(p_summary, '')))
  from public.jobs j
  left join public.companies co on co.id = j.company_id
  where j.status in ('draft', 'published', 'paused')
    and ((j.visibility = 'public' and j.status = 'published') or j.owner_workspace_id = p_workspace_id)
    and (p_exclude is null or j.id <> p_exclude)
    and extensions.similarity(lower(j.title), lower(p_title)) > 0.5
    and (p_company is null or p_company = '' or extensions.similarity(lower(coalesce(j.source_company_name, co.name, '')), lower(p_company)) > 0.5)
    and (p_location is null or p_location = '' or j.location is null or extensions.similarity(lower(j.location), lower(p_location)) > 0.4)
  order by 5 desc
  limit 5
$$;

-- Pool ranking works for any job the workspace manages (incl. sourced jobs it added).
create or replace function public.talent_pool_for_job(p_job_id uuid, p_limit integer default 50)
returns table (
  candidate_id uuid, is_own boolean, similarity double precision,
  full_name text, contact_email text, contact_phone text,
  headline text, location text, experience_years double precision, skills text[], uploaded_at timestamptz,
  status public.pool_status, do_not_contact boolean
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ws uuid := public.job_workspace_id(p_job_id); v_emb extensions.vector;
begin
  if v_ws is null or not public.is_company_member(v_ws) then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  select embedding into v_emb from public.jobs where id = p_job_id;
  if v_emb is null then return; end if;
  return query
  select p.id, (p.workspace_id = v_ws), (1 - (p.embedding <=> v_emb))::double precision,
         case when p.workspace_id = v_ws then p.full_name end,
         case when p.workspace_id = v_ws then p.contact_email end,
         case when p.workspace_id = v_ws then p.contact_phone end,
         p.headline, p.location, p.experience_years::double precision, p.skills, p.created_at,
         case when p.workspace_id = v_ws then p.status end,
         case when p.workspace_id = v_ws then p.do_not_contact else false end
  from public.pool_candidates p
  join public.companies co on co.id = p.workspace_id and co.status = 'active'
  where p.embedding is not null and (p.workspace_id = v_ws or co.share_pool_anonymously)
  order by p.embedding <=> v_emb
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

revoke execute on function public.find_similar_jobs(text, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.confirm_job_open(uuid), public.request_job_public(uuid), public.job_workspace_id(uuid) from public, anon;
grant execute on function public.confirm_job_open(uuid), public.request_job_public(uuid), public.job_workspace_id(uuid) to authenticated;

-- 7c: private apply contacts never reach anonymous visitors. Anonymous reads get
-- every public column except the apply contact and free-text instructions (which
-- often contain phone numbers). Signed-in users see them; anonymous visitors
-- reveal them after a human check (server side). New jobs columns must be added
-- here to be readable anonymously.
revoke select on public.jobs from anon;
grant select (
  id, company_id, source_type, source_name, source_url, source_company_name, title, description_summary,
  required_skills, nice_skills, required_certifications, domains, min_exp, max_exp, location, work_mode,
  employment_type, salary_min, salary_max, salary_currency, apply_method, status, expires_at, published_at,
  created_at, updated_at, origin, visibility
) on public.jobs to anon;

-- Candidates are matched only to jobs on the public board.
create or replace function public.match_jobs_for_candidate(p_candidate_id uuid, p_limit integer default 50)
returns table (job_id uuid, similarity double precision)
language sql stable security definer set search_path = public, extensions as $$
  select j.id, 1 - (c.embedding <=> j.embedding)
  from public.candidates c
  join public.jobs j on j.embedding is not null and j.status = 'published' and j.visibility = 'public'
                     and (j.expires_at is null or j.expires_at > now())
  where c.id = p_candidate_id and c.embedding is not null
    and public.candidate_passes_hard_filters(j, c)
  order by c.embedding <=> j.embedding
  limit p_limit
$$;
