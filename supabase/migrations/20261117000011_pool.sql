-- A2 (addendum section 3): the recruiter Talent Pool, separate from the public
-- `candidates` table (D-027).
--   pool_candidates   one person in one workspace's pool (private to members)
--   pool_imports      one bulk upload (lawful-basis confirmation recorded)
--   pool_import_files one file of an upload, processed by a background queue
-- Files go from the browser straight to the private `resumes` bucket under
-- pool/<workspace_id>/..., so large batches never pass through a web request.

create type public.pool_status as enum ('new', 'contacted', 'interested', 'not_interested', 'hired');
create type public.pool_file_status as enum ('queued', 'parsing', 'done', 'duplicate', 'failed');

create table public.pool_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.companies(id) on delete cascade,
  full_name text,
  headline text,
  summary text,
  location text,
  contact_email text,
  contact_phone text,
  latest_title text,
  latest_employer text,
  experience_years numeric(4,1) not null default 0 check (experience_years >= 0),
  skills text[] not null default '{}',
  languages text[] not null default '{}',
  experiences jsonb not null default '[]',
  education jsonb not null default '[]',
  certifications jsonb not null default '[]',
  -- recruiter-only workspace data (rule 3: never shown outside the workspace)
  tags text[] not null default '{}',
  notes text not null default '' check (length(notes) <= 10000),
  status public.pool_status not null default 'new',
  do_not_contact boolean not null default false,
  source text not null default 'uploaded',
  -- the resume file (private bucket, signed URLs only)
  storage_path text,
  original_filename text,
  mime_type text,
  size_bytes integer,
  parsed_by text check (parsed_by in ('ai', 'basic', 'manual')),
  -- dedupe keys (lowercased / digits only), maintained by trigger
  email_norm text,
  phone_norm text,
  name_employer_norm text,
  -- set when the person joined Vouch and added this profile to their account
  claimed_candidate_id uuid references public.candidates(id) on delete set null,
  embedding extensions.vector(1024),
  embedding_hash text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pool_candidates_ws_idx on public.pool_candidates(workspace_id, created_at desc);
create index pool_candidates_email_idx on public.pool_candidates(workspace_id, email_norm) where email_norm is not null;
create index pool_candidates_phone_idx on public.pool_candidates(workspace_id, phone_norm) where phone_norm is not null;
create index pool_candidates_ne_idx on public.pool_candidates(workspace_id, name_employer_norm) where name_employer_norm is not null;
create index pool_candidates_email_any_idx on public.pool_candidates(email_norm) where email_norm is not null;
create index pool_candidates_skills_idx on public.pool_candidates using gin (skills);
create index pool_candidates_tags_idx on public.pool_candidates using gin (tags);

create table public.pool_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  lawful_basis_confirmed boolean not null check (lawful_basis_confirmed),
  file_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index pool_imports_ws_idx on public.pool_imports(workspace_id, created_at desc);

create table public.pool_import_files (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.pool_imports(id) on delete cascade,
  workspace_id uuid not null references public.companies(id) on delete cascade,
  original_filename text not null,
  storage_path text not null,
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  status public.pool_file_status not null default 'queued',
  error text,
  attempts integer not null default 0,
  locked_at timestamptz,
  pool_candidate_id uuid references public.pool_candidates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pool_import_files_queue_idx on public.pool_import_files(status, created_at) where status in ('queued', 'parsing');
create index pool_import_files_import_idx on public.pool_import_files(import_id);

create trigger set_updated_at before update on public.pool_candidates for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pool_import_files for each row execute function public.set_updated_at();

-- Normalised dedupe keys.
create or replace function public.pool_norm_keys() returns trigger language plpgsql as $$
declare v_digits text;
begin
  new.email_norm := nullif(lower(btrim(coalesce(new.contact_email, ''))), '');
  v_digits := regexp_replace(coalesce(new.contact_phone, ''), '\D', '', 'g');
  new.phone_norm := case when length(v_digits) >= 7 then right(v_digits, 10) end;
  new.name_employer_norm := case
    when nullif(btrim(coalesce(new.full_name, '')), '') is not null and nullif(btrim(coalesce(new.latest_employer, '')), '') is not null
    then lower(regexp_replace(btrim(new.full_name), '\s+', ' ', 'g')) || '|' || lower(regexp_replace(btrim(new.latest_employer), '\s+', ' ', 'g'))
  end;
  return new;
end $$;
create trigger pool_norm_keys before insert or update on public.pool_candidates
  for each row execute function public.pool_norm_keys();

-- Guard: workspace, file, embedding and claim fields are set by the trusted
-- backend only; members edit profile, tags, notes, status and do_not_contact.
-- Pool cap enforced on insert.
-- Not security definer: is_trusted_backend() must see the real caller.
create or replace function public.guard_pool_candidates() returns trigger
language plpgsql set search_path = public, extensions as $$
declare v_cap integer; v_count integer;
begin
  if tg_op = 'INSERT' then
    select pool_cap into v_cap from public.companies where id = new.workspace_id;
    select count(*) into v_count from public.pool_candidates where workspace_id = new.workspace_id;
    if v_count >= coalesce(v_cap, 0) then
      raise exception 'your talent pool is full (% profiles)', v_cap using errcode = '54000';
    end if;
    return new;
  end if;
  if not public.is_trusted_backend() and (
       new.workspace_id is distinct from old.workspace_id or new.storage_path is distinct from old.storage_path
       or new.embedding is distinct from old.embedding or new.embedding_hash is distinct from old.embedding_hash
       or new.claimed_candidate_id is distinct from old.claimed_candidate_id or new.created_by is distinct from old.created_by) then
    raise exception 'not allowed to change protected pool fields' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_pool_candidates before insert or update on public.pool_candidates
  for each row execute function public.guard_pool_candidates();

-- Audit do-not-contact changes (definer: write_audit is not granted to users).
create or replace function public.audit_pool_candidates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.do_not_contact is distinct from old.do_not_contact then
    perform public.write_audit('pool.do_not_contact', 'pool_candidates', new.id,
      jsonb_build_object('workspace_id', new.workspace_id, 'do_not_contact', new.do_not_contact));
  end if;
  return null;
end $$;
create trigger audit_pool_candidates after update on public.pool_candidates
  for each row execute function public.audit_pool_candidates();

-- RLS: a workspace's pool is readable only by its members.
alter table public.pool_candidates enable row level security;
alter table public.pool_imports enable row level security;
alter table public.pool_import_files enable row level security;

create policy pool_candidates_member_select on public.pool_candidates for select to authenticated
  using (public.is_company_member(workspace_id));
create policy pool_candidates_member_update on public.pool_candidates for update to authenticated
  using (public.is_company_member(workspace_id)) with check (public.is_company_member(workspace_id));
-- inserts: background processing (trusted backend); deletes: delete_pool_candidate()

create policy pool_imports_member_select on public.pool_imports for select to authenticated
  using (public.is_company_member(workspace_id));
create policy pool_import_files_member_select on public.pool_import_files for select to authenticated
  using (public.is_company_member(workspace_id));
-- inserts: start_pool_import() / queue_pool_files(); updates: trusted backend

grant select, update on public.pool_candidates to authenticated;
grant select on public.pool_imports, public.pool_import_files to authenticated;
grant all on public.pool_candidates, public.pool_imports, public.pool_import_files to service_role;

-- Storage: members upload/read/delete files under pool/<workspace_id>/.
create policy resumes_pool_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = 'pool'
              and public.is_company_member(((storage.foldername(name))[2])::uuid));
create policy resumes_pool_select on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = 'pool'
         and public.is_company_member(((storage.foldername(name))[2])::uuid));
create policy resumes_pool_delete on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = 'pool'
         and public.is_company_member(((storage.foldername(name))[2])::uuid));

-- Start a bulk upload: checks membership, the per-batch file cap and room in the pool.
create or replace function public.start_pool_import(p_workspace_id uuid, p_file_count integer, p_lawful_basis boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ws public.companies; v_used integer; v_pending integer; v_id uuid;
begin
  if not public.is_company_member(p_workspace_id) then raise exception 'not a workspace member' using errcode = '42501'; end if;
  if not coalesce(p_lawful_basis, false) then
    raise exception 'confirm you are allowed to add these resumes' using errcode = '22023';
  end if;
  select * into v_ws from public.companies where id = p_workspace_id;
  if p_file_count < 1 then raise exception 'choose at least one file' using errcode = '22023'; end if;
  if p_file_count > v_ws.batch_file_cap then
    raise exception 'upload at most % files at a time', v_ws.batch_file_cap using errcode = '54000';
  end if;
  select count(*) into v_used from public.pool_candidates where workspace_id = p_workspace_id;
  select count(*) into v_pending from public.pool_import_files where workspace_id = p_workspace_id and status in ('queued', 'parsing');
  if v_used + v_pending + p_file_count > v_ws.pool_cap then
    raise exception 'your talent pool has room for % more profiles (plan limit %)',
      greatest(v_ws.pool_cap - v_used - v_pending, 0), v_ws.pool_cap using errcode = '54000';
  end if;
  insert into public.pool_imports(workspace_id, created_by, lawful_basis_confirmed, file_count)
  values (p_workspace_id, auth.uid(), true, p_file_count) returning id into v_id;
  perform public.write_audit('pool.import_started', 'pool_imports', v_id,
    jsonb_build_object('workspace_id', p_workspace_id, 'files', p_file_count, 'lawful_basis_confirmed', true));
  return v_id;
end $$;

-- Queue uploaded files. p_files: [{storage_path, original_filename, size_bytes}].
-- Paths must sit in this workspace's pool folder.
create or replace function public.queue_pool_files(p_import_id uuid, p_files jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare v_imp public.pool_imports; v_n integer;
begin
  select * into v_imp from public.pool_imports where id = p_import_id;
  if v_imp.id is null or not public.is_company_member(v_imp.workspace_id) then
    raise exception 'upload not found' using errcode = 'P0002';
  end if;
  if jsonb_array_length(p_files) + (select count(*) from public.pool_import_files where import_id = p_import_id) > v_imp.file_count then
    raise exception 'more files than this upload was started with' using errcode = '54000';
  end if;
  if exists (select 1 from jsonb_array_elements(p_files) f
             where (f ->> 'storage_path') not like 'pool/' || v_imp.workspace_id || '/%'
                or (f ->> 'storage_path') like '%..%') then
    raise exception 'invalid file path' using errcode = '22023';
  end if;
  insert into public.pool_import_files(import_id, workspace_id, original_filename, storage_path, size_bytes)
  select p_import_id, v_imp.workspace_id, left(coalesce(nullif(btrim(f ->> 'original_filename'), ''), 'resume'), 200),
         f ->> 'storage_path', (f ->> 'size_bytes')::integer
  from jsonb_array_elements(p_files) f;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Delete a pool profile: by a member of its workspace, or by the person it is
-- about (verified email). Returns the storage path for the server to remove.
create or replace function public.delete_pool_candidate(p_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare u public.pool_candidates; v_by_person boolean;
begin
  select * into u from public.pool_candidates where id = p_id for update;
  if u.id is null then raise exception 'profile not found' using errcode = 'P0002'; end if;
  v_by_person := public.my_verified_email() is not null and u.email_norm = public.my_verified_email();
  if not (v_by_person or public.is_company_member(u.workspace_id)) then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  delete from public.pool_candidates where id = u.id;
  perform public.write_audit(case when v_by_person then 'pool.deleted_by_person' else 'pool.deleted' end,
    'pool_candidates', u.id, jsonb_build_object('workspace_id', u.workspace_id));
  return array_remove(array[u.storage_path], null);
end $$;

-- Pool search (security invoker: RLS limits it to the caller's workspace).
-- Text, skills, title, location, experience, tag and status filters; optional
-- semantic ordering by an embedded query.
create or replace function public.search_pool(
  p_workspace_id uuid, p_text text default null, p_skills text[] default null, p_title text default null,
  p_location text default null, p_min_exp numeric default null, p_tag text default null, p_status text default null,
  p_query_embedding text default null, p_limit integer default 100, p_offset integer default 0
) returns table (
  id uuid, full_name text, headline text, location text, contact_email text, contact_phone text,
  latest_title text, latest_employer text, experience_years numeric, skills text[], tags text[],
  status public.pool_status, do_not_contact boolean, claimed boolean, created_at timestamptz,
  similarity double precision, total bigint
)
language sql stable set search_path = public, extensions as $$
  with f as (
    select p.*,
           case when p_query_embedding is not null and p.embedding is not null
                then 1 - (p.embedding <=> p_query_embedding::extensions.vector) end as sim
    from public.pool_candidates p
    where p.workspace_id = p_workspace_id
      and (p_text is null or p_text = '' or
           concat_ws(' ', p.full_name, p.headline, p.latest_title, p.latest_employer, p.location, p.contact_email,
                     array_to_string(p.skills, ' '), array_to_string(p.tags, ' ')) ilike '%' || p_text || '%')
      and (p_skills is null or cardinality(p_skills) = 0 or
           (select bool_and(exists (select 1 from unnest(p.skills) s where lower(s) = lower(btrim(w)))) from unnest(p_skills) w))
      and (p_title is null or p_title = '' or concat_ws(' ', p.headline, p.latest_title) ilike '%' || p_title || '%')
      and (p_location is null or p_location = '' or p.location ilike '%' || p_location || '%')
      and (p_min_exp is null or p.experience_years >= p_min_exp)
      and (p_tag is null or p_tag = '' or exists (select 1 from unnest(p.tags) t where lower(t) = lower(btrim(p_tag))))
      and (p_status is null or p_status = '' or p.status::text = p_status)
  )
  select f.id, f.full_name, f.headline, f.location, f.contact_email, f.contact_phone, f.latest_title, f.latest_employer,
         f.experience_years, f.skills, f.tags, f.status, f.do_not_contact, f.claimed_candidate_id is not null,
         f.created_at, f.sim, count(*) over ()
  from f
  order by f.sim desc nulls last, f.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Rank the pool for one of the caller's jobs: own pool in full; other
-- workspaces' pools only if they opted in to anonymous sharing (D-026), then
-- with identity columns null.
drop function if exists public.talent_pool_for_job(uuid, integer);
create function public.talent_pool_for_job(p_job_id uuid, p_limit integer default 50)
returns table (
  candidate_id uuid, is_own boolean, similarity double precision,
  full_name text, contact_email text, contact_phone text,
  headline text, location text, experience_years double precision, skills text[], uploaded_at timestamptz,
  status public.pool_status, do_not_contact boolean
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_company uuid := public.job_company_id(p_job_id); v_emb extensions.vector;
begin
  if v_company is null or not public.is_company_member(v_company) then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  select embedding into v_emb from public.jobs where id = p_job_id;
  if v_emb is null then return; end if;
  return query
  select p.id, (p.workspace_id = v_company), (1 - (p.embedding <=> v_emb))::double precision,
         case when p.workspace_id = v_company then p.full_name end,
         case when p.workspace_id = v_company then p.contact_email end,
         case when p.workspace_id = v_company then p.contact_phone end,
         p.headline, p.location, p.experience_years::double precision, p.skills, p.created_at,
         case when p.workspace_id = v_company then p.status end,
         case when p.workspace_id = v_company then p.do_not_contact else false end
  from public.pool_candidates p
  join public.companies co on co.id = p.workspace_id and co.status = 'active'
  where p.embedding is not null and (p.workspace_id = v_company or co.share_pool_anonymously)
  order by p.embedding <=> v_emb
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke execute on function public.talent_pool_for_job(uuid, integer) from public, anon;
grant execute on function public.talent_pool_for_job(uuid, integer) to authenticated;

-- Profiles in any pool for the signed-in person's verified email.
drop function if exists public.my_uploaded_profiles();
create function public.my_uploaded_profiles()
returns table (id uuid, company_name text, headline text, skills_count integer, uploaded_at timestamptz, claimed boolean)
language sql stable security definer set search_path = public as $$
  select p.id, case when co.kind = 'company' then co.name else 'An independent recruiter' end, p.headline,
         cardinality(p.skills), p.created_at, p.claimed_candidate_id is not null
  from public.pool_candidates p join public.companies co on co.id = p.workspace_id
  where public.my_verified_email() is not null and p.email_norm = public.my_verified_email()
  order by p.created_at desc
$$;

-- The person adds a pool profile to their own Vouch profile: details fill
-- blanks in their profile (their own entries win). The recruiter keeps their
-- pool entry, now marked as on Vouch; the person can still delete it.
create or replace function public.claim_uploaded_profile(p_candidate_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := public.my_verified_email(); v_mine uuid := public.my_candidate_id(); u public.pool_candidates; e jsonb; i integer := 0;
begin
  if v_email is null then raise exception 'verify your email address first' using errcode = '42501'; end if;
  if v_mine is null then raise exception 'only candidate accounts can claim a profile' using errcode = '42501'; end if;
  select * into u from public.pool_candidates where id = p_candidate_id for update;
  if u.id is null or u.email_norm is distinct from v_email then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  update public.candidates m set
    full_name = coalesce(m.full_name, u.full_name), headline = coalesce(m.headline, u.headline),
    summary = coalesce(m.summary, u.summary), location = coalesce(m.location, u.location),
    contact_email = coalesce(m.contact_email, u.contact_email), contact_phone = coalesce(m.contact_phone, u.contact_phone),
    languages = case when cardinality(m.languages) = 0 then u.languages else m.languages end,
    experience_years = greatest(m.experience_years, u.experience_years), needs_matching = true
  where m.id = v_mine;
  insert into public.candidate_skills(candidate_id, skill, source)
  select distinct on (lower(btrim(s))) v_mine, btrim(s), 'parsed'::public.skill_source from unnest(u.skills) s
  where btrim(s) <> '' on conflict do nothing;
  if not exists (select 1 from public.experiences where candidate_id = v_mine) then
    for e in select * from jsonb_array_elements(u.experiences) loop
      if nullif(btrim(e ->> 'title'), '') is not null then
        insert into public.experiences(candidate_id, title, company, start_date, end_date, is_current, description, position)
        values (v_mine, btrim(e ->> 'title'), nullif(btrim(e ->> 'company'), ''), nullif(e ->> 'start_date', '')::date,
                nullif(e ->> 'end_date', '')::date, coalesce((e ->> 'is_current')::boolean, false), nullif(e ->> 'description', ''), i);
        i := i + 1;
      end if;
    end loop;
  end if;
  if not exists (select 1 from public.education where candidate_id = v_mine) then
    insert into public.education(candidate_id, institution, degree, field, start_date, end_date)
    select v_mine, btrim(x ->> 'institution'), nullif(x ->> 'degree', ''), nullif(x ->> 'field', ''),
           nullif(x ->> 'start_date', '')::date, nullif(x ->> 'end_date', '')::date
    from jsonb_array_elements(u.education) x where nullif(btrim(x ->> 'institution'), '') is not null;
  end if;
  if not exists (select 1 from public.certifications where candidate_id = v_mine) then
    insert into public.certifications(candidate_id, name, issuer)
    select v_mine, btrim(x ->> 'name'), nullif(x ->> 'issuer', '')
    from jsonb_array_elements(u.certifications) x where nullif(btrim(x ->> 'name'), '') is not null;
  end if;
  update public.pool_candidates set claimed_candidate_id = v_mine where id = u.id; -- definer: trusted
  perform public.write_audit('pool.claimed', 'pool_candidates', u.id, jsonb_build_object('workspace_id', u.workspace_id));
end $$;

-- Old (D-022) entry point now deletes from the pool.
create or replace function public.delete_uploaded_profile(p_candidate_id uuid) returns text[]
language sql security definer set search_path = public as $$ select public.delete_pool_candidate(p_candidate_id) $$;

-- Account deletion: erase pool profiles about this (verified) email everywhere. Service only.
create or replace function public.erase_uploaded_profiles_for_email(p_email text) returns text[]
language plpgsql security definer set search_path = public as $$
declare v_paths text[];
begin
  select coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}') into v_paths
  from public.pool_candidates where email_norm = lower(btrim(p_email));
  delete from public.pool_candidates where email_norm = lower(btrim(p_email));
  return v_paths;
end $$;

-- Move any D-022 uploads (unclaimed rows in candidates) into the pool.
insert into public.pool_candidates(id, workspace_id, full_name, headline, summary, location, contact_email, contact_phone,
  latest_title, latest_employer, experience_years, skills, languages, experiences, education, certifications,
  storage_path, original_filename, mime_type, size_bytes, parsed_by, embedding, embedding_hash, created_at)
select c.id, c.uploaded_by_company_id, c.full_name, c.headline, c.summary, c.location, c.contact_email, c.contact_phone,
  (select e.title from public.experiences e where e.candidate_id = c.id order by e.position limit 1),
  (select e.company from public.experiences e where e.candidate_id = c.id order by e.position limit 1),
  c.experience_years,
  coalesce((select array_agg(s.skill order by s.skill) from public.candidate_skills s where s.candidate_id = c.id), '{}'),
  c.languages,
  coalesce((select jsonb_agg(jsonb_build_object('title', e.title, 'company', e.company, 'start_date', e.start_date,
     'end_date', e.end_date, 'is_current', e.is_current, 'description', e.description) order by e.position)
     from public.experiences e where e.candidate_id = c.id), '[]'),
  coalesce((select jsonb_agg(jsonb_build_object('institution', x.institution, 'degree', x.degree, 'field', x.field,
     'start_date', x.start_date, 'end_date', x.end_date)) from public.education x where x.candidate_id = c.id), '[]'),
  coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'issuer', x.issuer)) from public.certifications x
     where x.candidate_id = c.id), '[]'),
  r.storage_path, r.original_filename, r.mime_type, r.size_bytes, 'basic', c.embedding, c.embedding_hash, c.created_at
from public.candidates c
left join lateral (select * from public.resumes r where r.candidate_id = c.id order by r.is_current desc, r.created_at desc limit 1) r on true
where c.claim_status = 'unclaimed' and c.uploaded_by_company_id is not null;
delete from public.candidates where claim_status = 'unclaimed' and uploaded_by_company_id is not null;

drop function if exists public.save_uploaded_profile(uuid, uuid, jsonb, jsonb);

revoke execute on function public.start_pool_import(uuid, integer, boolean), public.queue_pool_files(uuid, jsonb),
  public.delete_pool_candidate(uuid), public.search_pool(uuid, text, text[], text, text, numeric, text, text, text, integer, integer),
  public.my_uploaded_profiles(), public.claim_uploaded_profile(uuid), public.delete_uploaded_profile(uuid) from public, anon;
grant execute on function public.start_pool_import(uuid, integer, boolean), public.queue_pool_files(uuid, jsonb),
  public.delete_pool_candidate(uuid), public.search_pool(uuid, text, text[], text, text, numeric, text, text, text, integer, integer),
  public.my_uploaded_profiles(), public.claim_uploaded_profile(uuid), public.delete_uploaded_profile(uuid) to authenticated;
revoke execute on function public.erase_uploaded_profiles_for_email(text) from public, anon, authenticated;
