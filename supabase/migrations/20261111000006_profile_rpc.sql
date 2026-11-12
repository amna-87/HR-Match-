-- Atomic profile save for the signed-in candidate. SECURITY INVOKER: every
-- statement runs under the caller's RLS policies (owner-only).
create or replace function public.save_candidate_profile(p jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_cid uuid := public.my_candidate_id();
  v_parsed text[];
  e jsonb;
  i integer := 0;
begin
  if v_cid is null then raise exception 'no candidate profile' using errcode = '42501'; end if;

  update public.candidates set
    full_name = nullif(btrim(p ->> 'full_name'), ''),
    headline = nullif(btrim(p ->> 'headline'), ''),
    summary = nullif(btrim(p ->> 'summary'), ''),
    location = nullif(btrim(p ->> 'location'), ''),
    contact_email = nullif(btrim(p ->> 'contact_email'), ''),
    contact_phone = nullif(btrim(p ->> 'contact_phone'), ''),
    languages = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'languages') x), '{}'),
    experience_years = coalesce((p ->> 'experience_years')::numeric, 0)
  where id = v_cid;

  -- skills: keep 'parsed' provenance when the skill came from the current resume
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

  update public.candidates set needs_matching = true where id = v_cid;
end $$;

revoke execute on function public.save_candidate_profile(jsonb) from public, anon;
