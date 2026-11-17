-- C1 (addendum section 5) + owner decision D-026: pool-vs-job matching views
-- and consent-based introductions across workspaces. See D-030.

-- Reverse view: best jobs for one pool profile, among the workspace's own open
-- jobs and the public board. Members of the profile's workspace only.
create or replace function public.jobs_for_pool_candidate(p_id uuid, p_limit integer default 20)
returns table (job_id uuid, title text, company text, location text, is_own boolean, similarity double precision)
language plpgsql stable security definer set search_path = public, extensions as $$
declare p public.pool_candidates;
begin
  select * into p from public.pool_candidates where id = p_id;
  if p.id is null or not public.is_company_member(p.workspace_id) then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if p.embedding is null then return; end if;
  return query
  select j.id, j.title, coalesce(co.name, j.source_company_name), j.location,
         (j.owner_workspace_id = p.workspace_id), (1 - (j.embedding <=> p.embedding))::double precision
  from public.jobs j
  left join public.companies co on co.id = j.company_id and co.kind = 'company'
  where j.status = 'published' and j.embedding is not null and (j.expires_at is null or j.expires_at > now())
    and (j.owner_workspace_id = p.workspace_id or j.visibility = 'public')
  order by j.embedding <=> p.embedding
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end $$;
revoke execute on function public.jobs_for_pool_candidate(uuid, integer) from public, anon;
grant execute on function public.jobs_for_pool_candidate(uuid, integer) to authenticated;

-- Introductions -----------------------------------------------------------------
-- A recruiter (requesting workspace) sees an anonymous card from another
-- workspace's shared pool and asks for an introduction for one of their jobs.
-- The full profile is released only after the PERSON agrees: in the app if they
-- are on Vouch (claimed), otherwise via the uploading workspace, which asks them
-- and confirms with a recorded lawful-basis statement.
create type public.intro_status as enum ('waiting_owner', 'waiting_person', 'accepted', 'declined', 'withdrawn');

create table public.intro_requests (
  id uuid primary key default gen_random_uuid(),
  requesting_workspace_id uuid not null references public.companies(id) on delete cascade,
  owner_workspace_id uuid not null references public.companies(id) on delete cascade,
  pool_candidate_id uuid not null references public.pool_candidates(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  message text check (message is null or length(message) <= 1000),
  status public.intro_status not null,
  requested_by uuid references public.users(id) on delete set null,
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requesting_workspace_id <> owner_workspace_id)
);
create unique index intro_requests_open_idx on public.intro_requests(job_id, pool_candidate_id)
  where status in ('waiting_owner', 'waiting_person', 'accepted');
create index intro_requests_owner_idx on public.intro_requests(owner_workspace_id, status);
create index intro_requests_requester_idx on public.intro_requests(requesting_workspace_id, created_at desc);
create trigger set_updated_at before update on public.intro_requests for each row execute function public.set_updated_at();

alter table public.intro_requests enable row level security;
-- Reads go through the functions below (each side sees only what it should);
-- the uploading workspace may read requests about its pool directly.
create policy intro_requests_owner_select on public.intro_requests for select to authenticated
  using (public.is_company_member(owner_workspace_id));
grant select on public.intro_requests to authenticated;
grant all on public.intro_requests to service_role;

create or replace function public.request_introduction(p_job_id uuid, p_pool_candidate_id uuid, p_message text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ws uuid := public.job_workspace_id(p_job_id); p public.pool_candidates; v_share boolean; v_id uuid; v_status public.intro_status;
begin
  if v_ws is null or not public.is_company_member(v_ws) then raise exception 'job not found' using errcode = 'P0002'; end if;
  select * into p from public.pool_candidates where id = p_pool_candidate_id;
  select share_pool_anonymously into v_share from public.companies where id = p.workspace_id and status = 'active';
  if p.id is null or p.workspace_id = v_ws or not coalesce(v_share, false) then
    raise exception 'profile not available' using errcode = 'P0002';
  end if;
  if p.do_not_contact then raise exception 'profile not available' using errcode = 'P0002'; end if;
  if exists (select 1 from public.intro_requests where job_id = p_job_id and pool_candidate_id = p.id
             and status in ('waiting_owner', 'waiting_person', 'accepted')) then
    raise exception 'you already asked for this introduction' using errcode = '23505';
  end if;
  v_status := case when p.claimed_candidate_id is not null then 'waiting_person' else 'waiting_owner' end;
  insert into public.intro_requests(requesting_workspace_id, owner_workspace_id, pool_candidate_id, job_id, message, status, requested_by)
  values (v_ws, p.workspace_id, p.id, p_job_id, nullif(btrim(coalesce(p_message, '')), ''), v_status, auth.uid())
  returning id into v_id;
  perform public.write_audit('intro.requested', 'intro_requests', v_id,
    jsonb_build_object('requesting_workspace_id', v_ws, 'job_id', p_job_id));
  return v_id;
end $$;

-- The uploading workspace answers after asking the person outside Vouch.
create or replace function public.answer_introduction_as_owner(p_id uuid, p_person_agreed boolean, p_lawful_basis boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.intro_requests;
begin
  select * into r from public.intro_requests where id = p_id for update;
  if r.id is null or not public.is_company_member(r.owner_workspace_id) or r.status <> 'waiting_owner' then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if p_person_agreed and not coalesce(p_lawful_basis, false) then
    raise exception 'confirm that the person agreed to share their resume' using errcode = '22023';
  end if;
  update public.intro_requests set status = case when p_person_agreed then 'accepted'::public.intro_status else 'declined' end,
         decided_by = auth.uid(), decided_at = now() where id = r.id;
  perform public.write_audit(case when p_person_agreed then 'intro.accepted_by_owner' else 'intro.declined' end,
    'intro_requests', r.id, jsonb_build_object('lawful_basis_confirmed', coalesce(p_lawful_basis, false)));
end $$;

-- The person (on Vouch) answers in the app.
create or replace function public.answer_introduction_as_person(p_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.intro_requests; v_mine uuid := public.my_candidate_id();
begin
  select i.* into r from public.intro_requests i join public.pool_candidates p on p.id = i.pool_candidate_id
  where i.id = p_id and p.claimed_candidate_id = v_mine for update of i;
  if r.id is null or v_mine is null or r.status <> 'waiting_person' then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  update public.intro_requests set status = case when p_accept then 'accepted'::public.intro_status else 'declined' end,
         decided_by = auth.uid(), decided_at = now() where id = r.id;
  perform public.write_audit(case when p_accept then 'intro.accepted_by_person' else 'intro.declined' end,
    'intro_requests', r.id, '{}'::jsonb);
end $$;

create or replace function public.withdraw_introduction(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.intro_requests set status = 'withdrawn', decided_by = auth.uid(), decided_at = now()
  where id = p_id and status in ('waiting_owner', 'waiting_person') and public.is_company_member(requesting_workspace_id);
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
end $$;

-- Requests a workspace sent. Identity appears only once accepted; the uploading
-- workspace is never revealed. Private notes, tags and status are never included.
create or replace function public.sent_introductions(p_workspace_id uuid)
returns table (id uuid, job_id uuid, job_title text, status public.intro_status, created_at timestamptz,
  headline text, location text, experience_years numeric, skills text[],
  full_name text, contact_email text, contact_phone text)
language sql stable security definer set search_path = public as $$
  select i.id, i.job_id, j.title, i.status, i.created_at, p.headline, p.location, p.experience_years, p.skills,
         case when i.status = 'accepted' then p.full_name end,
         case when i.status = 'accepted' then p.contact_email end,
         case when i.status = 'accepted' then p.contact_phone end
  from public.intro_requests i
  join public.pool_candidates p on p.id = i.pool_candidate_id
  join public.jobs j on j.id = i.job_id
  where i.requesting_workspace_id = p_workspace_id and public.is_company_member(p_workspace_id)
  order by i.created_at desc
$$;

-- Full profile for an accepted introduction (requesting workspace only).
create or replace function public.introduced_profile(p_id uuid)
returns table (full_name text, headline text, summary text, location text, contact_email text, contact_phone text,
  experience_years numeric, skills text[], languages text[], experiences jsonb, education jsonb, certifications jsonb,
  has_resume boolean, job_title text)
language sql stable security definer set search_path = public as $$
  select p.full_name, p.headline, p.summary, p.location, p.contact_email, p.contact_phone, p.experience_years, p.skills,
         p.languages, p.experiences, p.education, p.certifications, p.storage_path is not null, j.title
  from public.intro_requests i
  join public.pool_candidates p on p.id = i.pool_candidate_id
  join public.jobs j on j.id = i.job_id
  where i.id = p_id and i.status = 'accepted' and public.is_company_member(i.requesting_workspace_id)
$$;

-- Requests waiting for the person (on Vouch). The requesting company is named
-- (they are asking to contact you); the uploading recruiter is not.
create or replace function public.my_introduction_requests()
returns table (id uuid, status public.intro_status, created_at timestamptz, message text,
  job_id uuid, job_title text, company text, location text, job_summary text, job_public boolean)
language sql stable security definer set search_path = public as $$
  select i.id, i.status, i.created_at, i.message, j.id, j.title,
         case when rc.kind = 'company' then rc.name else 'An independent recruiter' end, j.location,
         j.description_summary, (j.visibility = 'public' and j.status = 'published')
  from public.intro_requests i
  join public.pool_candidates p on p.id = i.pool_candidate_id
  join public.jobs j on j.id = i.job_id
  join public.companies rc on rc.id = i.requesting_workspace_id
  where p.claimed_candidate_id = public.my_candidate_id() and public.my_candidate_id() is not null
  order by i.created_at desc
$$;

-- Requests about this workspace's pool (the uploading side), with who asked.
create or replace function public.introductions_for_my_pool(p_workspace_id uuid)
returns table (id uuid, status public.intro_status, created_at timestamptz, message text, pool_candidate_id uuid,
  person text, job_title text, requesting_company text)
language sql stable security definer set search_path = public as $$
  select i.id, i.status, i.created_at, i.message, p.id, coalesce(p.full_name, 'Unnamed profile'), j.title, rc.name
  from public.intro_requests i
  join public.pool_candidates p on p.id = i.pool_candidate_id
  join public.jobs j on j.id = i.job_id
  join public.companies rc on rc.id = i.requesting_workspace_id
  where i.owner_workspace_id = p_workspace_id and public.is_company_member(p_workspace_id)
  order by (i.status = 'waiting_owner') desc, i.created_at desc
$$;

create or replace function public.introduced_resume_path(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.storage_path from public.intro_requests i join public.pool_candidates p on p.id = i.pool_candidate_id
  where i.id = p_id and i.status = 'accepted' and public.is_company_member(i.requesting_workspace_id)
$$;

-- The network ranking also tells the requester whether they already asked.
create or replace function public.intro_status_for_job(p_job_id uuid)
returns table (pool_candidate_id uuid, intro_id uuid, status public.intro_status)
language sql stable security definer set search_path = public as $$
  select distinct on (i.pool_candidate_id) i.pool_candidate_id, i.id, i.status
  from public.intro_requests i
  where i.job_id = p_job_id and public.is_company_member(i.requesting_workspace_id)
  order by i.pool_candidate_id, i.created_at desc
$$;

revoke execute on function public.request_introduction(uuid, uuid, text), public.answer_introduction_as_owner(uuid, boolean, boolean),
  public.answer_introduction_as_person(uuid, boolean), public.withdraw_introduction(uuid), public.sent_introductions(uuid),
  public.introduced_profile(uuid), public.my_introduction_requests(), public.introductions_for_my_pool(uuid),
  public.introduced_resume_path(uuid), public.intro_status_for_job(uuid) from public, anon;
grant execute on function public.request_introduction(uuid, uuid, text), public.answer_introduction_as_owner(uuid, boolean, boolean),
  public.answer_introduction_as_person(uuid, boolean), public.withdraw_introduction(uuid), public.sent_introductions(uuid),
  public.introduced_profile(uuid), public.my_introduction_requests(), public.introductions_for_my_pool(uuid),
  public.introduced_resume_path(uuid), public.intro_status_for_job(uuid) to authenticated;

-- Network cards never include people marked do-not-contact.
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
  where p.embedding is not null
    and (p.workspace_id = v_ws or (co.share_pool_anonymously and not p.do_not_contact))
  order by p.embedding <=> v_emb
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
