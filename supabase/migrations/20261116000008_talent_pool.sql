-- Recruiter-uploaded resumes ("talent pool"), see docs/decisions.md D-022.
--
-- A recruiter uploads resumes of people who are not on Vouch. Each becomes an
-- UNCLAIMED candidate profile owned by the uploading company:
--   * the uploading company sees the full profile and the resume file;
--   * other companies only see an anonymous card (headline, location, years,
--     skills) through talent_pool_for_job() - never name, contact details,
--     summary, employers or the file;
--   * the person is never emailed (principle 2). If they sign up with the same,
--     verified email address they can claim the profile (it merges into their
--     account and is matched to jobs) or delete it.
-- Unclaimed profiles stay out of normal matching, matches and applications.

alter table public.candidates
  add column uploaded_by_company_id uuid references public.companies(id) on delete cascade;
create index candidates_uploaded_by_idx on public.candidates(uploaded_by_company_id) where claim_status = 'unclaimed';
create index candidates_contact_email_unclaimed_idx on public.candidates(lower(contact_email)) where claim_status = 'unclaimed';

-- uploaded_by_company_id is set only by the functions below.
create or replace function public.guard_candidates_upload() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_trusted_backend()
     and new.uploaded_by_company_id is distinct from old.uploaded_by_company_id then
    raise exception 'not allowed to change protected candidate fields' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_candidates_upload before update on public.candidates
  for each row execute function public.guard_candidates_upload();

-- True when the caller's company uploaded this still-unclaimed profile.
create or replace function public.company_owns_upload(p_candidate_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.candidates c
    where c.id = p_candidate_id and c.claim_status = 'unclaimed'
      and c.uploaded_by_company_id in (select public.my_company_ids())
  )
$$;

-- The signed-in user's email, only if Supabase Auth has verified it.
create or replace function public.my_verified_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(u.email) from public.users u join auth.users a on a.id = u.id
  where u.id = auth.uid() and u.status = 'active' and a.email_confirmed_at is not null and u.email <> ''
$$;
revoke execute on function public.my_verified_email() from public, anon;
grant execute on function public.my_verified_email() to authenticated;

-- RLS: the uploading company reads/edits/deletes its own unclaimed uploads.
create policy candidates_uploader_select on public.candidates for select to authenticated
  using (public.company_owns_upload(id));
create policy candidates_uploader_update on public.candidates for update to authenticated
  using (public.company_owns_upload(id)) with check (public.company_owns_upload(id));
create policy resumes_uploader_select on public.resumes for select to authenticated
  using (public.company_owns_upload(candidate_id));
create policy skills_uploader_select on public.candidate_skills for select to authenticated
  using (public.company_owns_upload(candidate_id));
create policy experiences_uploader_select on public.experiences for select to authenticated
  using (public.company_owns_upload(candidate_id));
create policy education_uploader_select on public.education for select to authenticated
  using (public.company_owns_upload(candidate_id));
create policy certifications_uploader_select on public.certifications for select to authenticated
  using (public.company_owns_upload(candidate_id));

-- Writes the editable profile fields + skills/experience/education/certifications
-- of one candidate. Internal: only called from security-definer functions.
create or replace function public.apply_candidate_profile(v_cid uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_parsed text[];
  e jsonb;
  i integer := 0;
begin
  update public.candidates set
    full_name = nullif(btrim(p ->> 'full_name'), ''),
    headline = nullif(btrim(p ->> 'headline'), ''),
    summary = nullif(btrim(p ->> 'summary'), ''),
    location = nullif(btrim(p ->> 'location'), ''),
    contact_email = nullif(lower(btrim(p ->> 'contact_email')), ''),
    contact_phone = nullif(btrim(p ->> 'contact_phone'), ''),
    languages = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'languages') x), '{}'),
    experience_years = coalesce((p ->> 'experience_years')::numeric, 0)
  where id = v_cid;

  select coalesce(array_agg(lower(x)), '{}') into v_parsed
  from public.resumes r, jsonb_array_elements_text(coalesce(r.parsed_json -> 'skills', '[]'::jsonb)) x
  where r.candidate_id = v_cid and r.is_current;

  delete from public.candidate_skills where candidate_id = v_cid and source in ('self', 'parsed');
  insert into public.candidate_skills(candidate_id, skill, source)
  select distinct on (lower(btrim(s))) v_cid, btrim(s),
         case when lower(btrim(s)) = any (v_parsed) then 'parsed'::public.skill_source else 'self'::public.skill_source end
  from jsonb_array_elements_text(coalesce(p -> 'skills', '[]'::jsonb)) s
  where btrim(s) <> ''
  on conflict do nothing;

  delete from public.experiences where candidate_id = v_cid;
  for e in select * from jsonb_array_elements(coalesce(p -> 'experiences', '[]'::jsonb)) loop
    if nullif(btrim(e ->> 'title'), '') is not null then
      insert into public.experiences(candidate_id, title, company, start_date, end_date, is_current, description, position)
      values (v_cid, btrim(e ->> 'title'), nullif(btrim(e ->> 'company'), ''), nullif(e ->> 'start_date', '')::date,
              nullif(e ->> 'end_date', '')::date, coalesce((e ->> 'is_current')::boolean, false), nullif(e ->> 'description', ''), i);
      i := i + 1;
    end if;
  end loop;

  delete from public.education where candidate_id = v_cid;
  insert into public.education(candidate_id, institution, degree, field, start_date, end_date)
  select v_cid, btrim(x ->> 'institution'), nullif(x ->> 'degree', ''), nullif(x ->> 'field', ''),
         nullif(x ->> 'start_date', '')::date, nullif(x ->> 'end_date', '')::date
  from jsonb_array_elements(coalesce(p -> 'education', '[]'::jsonb)) x
  where nullif(btrim(x ->> 'institution'), '') is not null;

  delete from public.certifications where candidate_id = v_cid;
  insert into public.certifications(candidate_id, name, issuer)
  select v_cid, btrim(x ->> 'name'), nullif(x ->> 'issuer', '')
  from jsonb_array_elements(coalesce(p -> 'certifications', '[]'::jsonb)) x
  where nullif(btrim(x ->> 'name'), '') is not null;
end $$;
revoke execute on function public.apply_candidate_profile(uuid, jsonb) from public, anon, authenticated;

-- Create (p_candidate_id null) or update an uploaded profile, optionally with its resume file record.
-- p_resume: {storage_path, original_filename, mime_type, size_bytes, parsed_json, parse_status, parse_error}
create or replace function public.save_uploaded_profile(p_company_id uuid, p_candidate_id uuid, p jsonb, p_resume jsonb default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_cid uuid := p_candidate_id;
begin
  if not public.is_company_member(p_company_id) then raise exception 'not a company member' using errcode = '42501'; end if;
  if (select role from public.users where id = auth.uid()) <> 'recruiter' then
    raise exception 'only recruiters can upload resumes' using errcode = '42501';
  end if;
  if v_cid is null then
    insert into public.candidates(user_id, claim_status, uploaded_by_company_id, open_to_work)
    values (null, 'unclaimed', p_company_id, true) returning id into v_cid;
  elsif not exists (select 1 from public.candidates where id = v_cid and claim_status = 'unclaimed'
                    and uploaded_by_company_id = p_company_id) then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if p_resume is not null then
    update public.resumes set is_current = false where candidate_id = v_cid;
    insert into public.resumes(candidate_id, storage_path, original_filename, mime_type, size_bytes, parsed_json, parse_status, parse_error)
    values (v_cid, p_resume ->> 'storage_path', p_resume ->> 'original_filename', p_resume ->> 'mime_type',
            (p_resume ->> 'size_bytes')::integer, p_resume -> 'parsed_json',
            coalesce(p_resume ->> 'parse_status', 'succeeded')::public.parse_status, p_resume ->> 'parse_error');
  end if;
  perform public.apply_candidate_profile(v_cid, p);
  -- embedding refresh is picked up by the server right after this call
  perform public.write_audit(case when p_candidate_id is null then 'talent_pool.uploaded' else 'talent_pool.updated' end,
    'candidates', v_cid, jsonb_build_object('company_id', p_company_id));
  return v_cid;
end $$;
revoke execute on function public.save_uploaded_profile(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_uploaded_profile(uuid, uuid, jsonb, jsonb) to authenticated;

-- Ranked talent pool for one of the caller's jobs. Own uploads come back in full;
-- other companies' uploads come back anonymous (identity columns are null).
create or replace function public.talent_pool_for_job(p_job_id uuid, p_limit integer default 50)
returns table (
  candidate_id uuid, is_own boolean, similarity double precision,
  full_name text, contact_email text, contact_phone text,
  headline text, location text, experience_years double precision, skills text[], uploaded_at timestamptz
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
  select c.id,
         (c.uploaded_by_company_id = v_company),
         (1 - (c.embedding <=> v_emb))::double precision,
         case when c.uploaded_by_company_id = v_company then c.full_name end,
         case when c.uploaded_by_company_id = v_company then c.contact_email end,
         case when c.uploaded_by_company_id = v_company then c.contact_phone end,
         c.headline, c.location, c.experience_years::double precision,
         coalesce((select array_agg(s.skill order by s.skill) from public.candidate_skills s where s.candidate_id = c.id), '{}'),
         c.created_at
  from public.candidates c
  join public.companies co on co.id = c.uploaded_by_company_id and co.status = 'active'
  where c.claim_status = 'unclaimed' and c.embedding is not null
  order by c.embedding <=> v_emb
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke execute on function public.talent_pool_for_job(uuid, integer) from public, anon;
grant execute on function public.talent_pool_for_job(uuid, integer) to authenticated;

-- Profiles uploaded for the signed-in person (matched on their verified email).
create or replace function public.my_uploaded_profiles()
returns table (id uuid, company_name text, headline text, skills_count integer, uploaded_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, co.name, c.headline,
         (select count(*)::integer from public.candidate_skills s where s.candidate_id = c.id), c.created_at
  from public.candidates c join public.companies co on co.id = c.uploaded_by_company_id
  where c.claim_status = 'unclaimed' and public.my_verified_email() is not null
    and lower(c.contact_email) = public.my_verified_email()
  order by c.created_at desc
$$;
revoke execute on function public.my_uploaded_profiles() from public, anon;
grant execute on function public.my_uploaded_profiles() to authenticated;

-- The person claims an uploaded profile: its data merges into their own
-- candidate profile (their own entries win), the uploaded copy is removed and
-- the uploading company loses access. Matching picks it up (needs_matching).
create or replace function public.claim_uploaded_profile(p_candidate_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := public.my_verified_email(); v_mine uuid := public.my_candidate_id(); u public.candidates;
begin
  if v_email is null then raise exception 'verify your email address first' using errcode = '42501'; end if;
  if v_mine is null then raise exception 'only candidate accounts can claim a profile' using errcode = '42501'; end if;
  select * into u from public.candidates where id = p_candidate_id and claim_status = 'unclaimed' for update;
  if u.id is null or lower(coalesce(u.contact_email, '')) <> v_email then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  update public.candidates m set
    full_name = coalesce(m.full_name, u.full_name),
    headline = coalesce(m.headline, u.headline),
    summary = coalesce(m.summary, u.summary),
    location = coalesce(m.location, u.location),
    contact_email = coalesce(m.contact_email, u.contact_email),
    contact_phone = coalesce(m.contact_phone, u.contact_phone),
    languages = case when cardinality(m.languages) = 0 then u.languages else m.languages end,
    experience_years = greatest(m.experience_years, u.experience_years),
    needs_matching = true
  where m.id = v_mine;

  insert into public.candidate_skills(candidate_id, skill, source)
  select v_mine, s.skill, s.source from public.candidate_skills s
  where s.candidate_id = u.id and s.source in ('self', 'parsed')
  on conflict do nothing;
  if not exists (select 1 from public.experiences where candidate_id = v_mine) then
    update public.experiences set candidate_id = v_mine where candidate_id = u.id;
  end if;
  if not exists (select 1 from public.education where candidate_id = v_mine) then
    update public.education set candidate_id = v_mine where candidate_id = u.id;
  end if;
  if not exists (select 1 from public.certifications where candidate_id = v_mine) then
    update public.certifications set candidate_id = v_mine where candidate_id = u.id;
  end if;
  -- the resume file becomes theirs; it is current only if they had none
  update public.resumes set candidate_id = v_mine,
         is_current = is_current and not exists (select 1 from public.resumes r where r.candidate_id = v_mine and r.is_current)
  where candidate_id = u.id;

  delete from public.candidates where id = u.id;
  perform public.write_audit('talent_pool.claimed', 'candidates', v_mine,
    jsonb_build_object('company_id', u.uploaded_by_company_id));
end $$;
revoke execute on function public.claim_uploaded_profile(uuid) from public, anon;
grant execute on function public.claim_uploaded_profile(uuid) to authenticated;

-- Delete an uploaded profile: by the uploading company, or by the person it is
-- about (verified email match). Returns resume storage paths for the server to remove.
create or replace function public.delete_uploaded_profile(p_candidate_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare u public.candidates; v_paths text[]; v_by_owner boolean;
begin
  select * into u from public.candidates where id = p_candidate_id and claim_status = 'unclaimed' for update;
  if u.id is null then raise exception 'profile not found' using errcode = 'P0002'; end if;
  v_by_owner := public.my_verified_email() is not null and lower(coalesce(u.contact_email, '')) = public.my_verified_email();
  if not (v_by_owner or public.company_owns_upload(u.id)) then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(storage_path), '{}') into v_paths from public.resumes where candidate_id = u.id;
  delete from public.candidates where id = u.id;
  perform public.write_audit(case when v_by_owner then 'talent_pool.deleted_by_person' else 'talent_pool.deleted' end,
    'candidates', u.id, jsonb_build_object('company_id', u.uploaded_by_company_id));
  return v_paths;
end $$;
revoke execute on function public.delete_uploaded_profile(uuid) from public, anon;
grant execute on function public.delete_uploaded_profile(uuid) to authenticated;

-- Account deletion: also erase profiles others uploaded about this (verified) email. Service only.
create or replace function public.erase_uploaded_profiles_for_email(p_email text) returns text[]
language plpgsql security definer set search_path = public as $$
declare v_paths text[];
begin
  select coalesce(array_agg(r.storage_path), '{}') into v_paths
  from public.resumes r join public.candidates c on c.id = r.candidate_id
  where c.claim_status = 'unclaimed' and lower(c.contact_email) = lower(p_email);
  delete from public.candidates where claim_status = 'unclaimed' and lower(contact_email) = lower(p_email);
  return v_paths;
end $$;
revoke execute on function public.erase_uploaded_profiles_for_email(text) from public, anon, authenticated;

-- Invitations: also require a verified email to accept (same rule as claiming).
create or replace function public.accept_invitation(p_invitation_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv public.company_invitations; v_user public.users;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null or v_user.status <> 'active' then raise exception 'not signed in' using errcode = '42501'; end if;
  if v_user.role <> 'recruiter' then raise exception 'only recruiter accounts can join a company' using errcode = '42501'; end if;
  if public.my_verified_email() is null then raise exception 'verify your email address first' using errcode = '42501'; end if;
  select * into v_inv from public.company_invitations where id = p_invitation_id for update;
  if v_inv.id is null or v_inv.status <> 'pending' or lower(v_inv.email) <> lower(v_user.email) then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if v_inv.expires_at <= now() then raise exception 'this invitation has expired' using errcode = 'P0001'; end if;
  insert into public.company_members(company_id, user_id, role) values (v_inv.company_id, v_user.id, v_inv.role)
  on conflict (company_id, user_id) do update set role = excluded.role;
  update public.company_invitations set status = 'accepted', accepted_by = v_user.id, accepted_at = now() where id = v_inv.id;
  perform public.write_audit('company.invitation_accepted', 'company_invitations', v_inv.id,
    jsonb_build_object('company_id', v_inv.company_id));
  return v_inv.company_id;
end $$;
