-- RPC functions. Each security-definer function re-checks authorization itself.
-- Service-only functions have EXECUTE revoked from anon/authenticated at the end.

-- ---------------------------------------------------------------------------
-- Accounts / companies
-- ---------------------------------------------------------------------------
create or replace function public.choose_role(p_role text, p_full_name text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_user public.users;
begin
  select * into v_user from public.users where id = auth.uid() for update;
  if v_user.id is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if v_user.onboarded then raise exception 'role already chosen' using errcode = 'P0001'; end if;
  if p_role not in ('candidate', 'recruiter') then raise exception 'invalid role' using errcode = '22023'; end if;
  update public.users set role = p_role::public.user_role, onboarded = true where id = v_user.id;
  if p_role = 'candidate' then
    insert into public.candidates(user_id, claim_status, full_name) values (v_user.id, 'claimed', nullif(btrim(p_full_name), ''))
    on conflict (user_id) do nothing;
  end if;
  perform public.write_audit('user.role_chosen', 'users', v_user.id, jsonb_build_object('role', p_role));
end $$;

create or replace function public.create_company(
  p_name text, p_website text default null, p_description text default null,
  p_size text default null, p_location text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.users where id = auth.uid() and role = 'recruiter' and status = 'active') then
    raise exception 'only recruiters can create companies' using errcode = '42501';
  end if;
  insert into public.companies(name, website, description, size, location, created_by)
  values (btrim(p_name), p_website, p_description, p_size, p_location, auth.uid()) returning id into v_id;
  insert into public.company_members(company_id, user_id, role) values (v_id, auth.uid(), 'admin');
  perform public.write_audit('company.created', 'companies', v_id, '{}'::jsonb);
  return v_id;
end $$;

-- Company admins add an existing recruiter account (by email) as a seat.
create or replace function public.add_company_member(p_company_id uuid, p_email text, p_role text default 'recruiter') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_id uuid;
begin
  if not public.is_company_admin(p_company_id) then raise exception 'not a company admin' using errcode = '42501'; end if;
  select id into v_user from public.users where lower(email) = lower(btrim(p_email)) and role = 'recruiter' and status = 'active';
  if v_user is null then raise exception 'no active recruiter account with that email' using errcode = 'P0002'; end if;
  insert into public.company_members(company_id, user_id, role) values (p_company_id, v_user, p_role::public.company_member_role)
  on conflict (company_id, user_id) do update set role = excluded.role returning id into v_id;
  perform public.write_audit('company.member_added', 'companies', p_company_id, jsonb_build_object('user_id', v_user, 'role', p_role));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Consent flow (Section 8). The ONLY path that creates applications.
-- Callable by the signed-in candidate, or by the trusted backend after it has
-- verified a signed, single-purpose email token (p_candidate_id required).
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_match(
  p_match_id uuid, p_decision text,
  p_ip_hash text default null, p_ua_hash text default null, p_candidate_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_candidate uuid;
  v_match public.matches;
  v_job public.jobs;
  v_ce uuid;
  v_app uuid;
begin
  if auth.uid() is not null then
    -- signed-in candidate: p_candidate_id is ignored
    v_candidate := public.my_candidate_id();
  elsif coalesce(auth.role(), 'service_role') = 'service_role' then
    -- trusted backend path (service role) after verifying a signed email token.
    -- anon has no EXECUTE; authenticated callers always carry auth.uid().
    v_candidate := p_candidate_id;
  end if;
  if v_candidate is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'decline', 'view') then raise exception 'invalid decision' using errcode = '22023'; end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if v_match.id is null or v_match.candidate_id <> v_candidate then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  select * into v_job from public.jobs where id = v_match.job_id;

  -- idempotent replies
  if (p_decision = 'approve' and v_match.status in ('approved', 'applied'))
     or (p_decision = 'decline' and v_match.status = 'declined')
     or (p_decision = 'view' and v_match.status = 'viewed') then
    return jsonb_build_object('status', v_match.status, 'idempotent', true);
  end if;
  if v_match.status <> 'notified' then
    raise exception 'match is % and can no longer be answered', v_match.status using errcode = 'P0001';
  end if;
  if v_match.expires_at is not null and v_match.expires_at <= now() then
    update public.matches set status = 'expired' where id = v_match.id;
    return jsonb_build_object('status', 'expired');
  end if;

  if v_job.source_type = 'sourced' then
    if p_decision <> 'view' then
      raise exception 'sourced jobs are applied to via the original listing' using errcode = 'P0001';
    end if;
    update public.matches set status = 'viewed', viewed_at = now() where id = v_match.id;
    return jsonb_build_object('status', 'viewed', 'apply_method', v_job.apply_method, 'apply_target', v_job.apply_target);
  end if;

  if p_decision = 'view' then
    update public.matches set viewed_at = coalesce(viewed_at, now()) where id = v_match.id;
    return jsonb_build_object('status', v_match.status);
  end if;

  if p_decision = 'decline' then
    insert into public.consent_events(candidate_id, type, subject_type, subject_id, granted, ip_hash, user_agent_hash)
    values (v_candidate, 'match_decline', 'match', v_match.id, false, p_ip_hash, p_ua_hash);
    update public.matches set status = 'declined', responded_at = now() where id = v_match.id;
    return jsonb_build_object('status', 'declined');
  end if;

  -- approve
  if v_job.status <> 'published' then
    raise exception 'this job is no longer accepting applications' using errcode = 'P0001';
  end if;
  insert into public.consent_events(candidate_id, type, subject_type, subject_id, granted, ip_hash, user_agent_hash)
  values (v_candidate, 'match_approval', 'match', v_match.id, true, p_ip_hash, p_ua_hash) returning id into v_ce;
  update public.matches set status = 'approved', responded_at = now() where id = v_match.id;
  insert into public.applications(match_id, job_id, candidate_id, consent_event_id)
  values (v_match.id, v_match.job_id, v_candidate, v_ce) returning id into v_app;
  update public.matches set status = 'applied' where id = v_match.id;
  return jsonb_build_object('status', 'applied', 'application_id', v_app, 'consent_event_id', v_ce);
end $$;

-- Redistribution consent: pending -> opted_in | declined ; opted_in -> withdrawn
create or replace function public.set_redistribution_consent(
  p_id uuid, p_status text, p_ip_hash text default null, p_ua_hash text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_row public.redistribution_consent;
  v_to public.redistribution_status := p_status::public.redistribution_status;
  v_strength text;
begin
  select * into v_row from public.redistribution_consent where id = p_id for update;
  if v_row.id is null or v_row.candidate_id is distinct from public.my_candidate_id() then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_row.status = v_to then return v_to::text; end if;
  if not ((v_row.status = 'pending' and v_to in ('opted_in', 'declined')) or (v_row.status = 'opted_in' and v_to = 'withdrawn')) then
    raise exception 'invalid redistribution transition % -> %', v_row.status, v_to using errcode = 'P0001';
  end if;
  update public.redistribution_consent set status = v_to where id = p_id;
  insert into public.consent_events(candidate_id, type, subject_type, subject_id, granted, ip_hash, user_agent_hash)
  values (v_row.candidate_id,
          case v_to when 'opted_in' then 'redistribution_opt_in' when 'declined' then 'redistribution_decline' else 'redistribution_withdraw' end,
          'redistribution', p_id, v_to = 'opted_in', p_ip_hash, p_ua_hash);
  if v_to = 'opted_in' then
    -- verified strengths become a higher-weight matching signal for this domain
    foreach v_strength in array v_row.strengths loop
      insert into public.candidate_skills(candidate_id, skill, source, weight, domain, feedback_id)
      values (v_row.candidate_id, v_strength, 'verified', 1.5, v_row.domain, v_row.feedback_id)
      on conflict do nothing;
    end loop;
    insert into public.candidate_skills(candidate_id, skill, source, weight, domain, feedback_id)
    values (v_row.candidate_id, v_row.domain, 'verified', 1.5, v_row.domain, v_row.feedback_id)
    on conflict do nothing;
  elsif v_to = 'withdrawn' then
    delete from public.candidate_skills
    where candidate_id = v_row.candidate_id and source = 'verified' and feedback_id = v_row.feedback_id and domain = v_row.domain;
  end if;
  update public.candidates set needs_matching = true where id = v_row.candidate_id;
  return v_to::text;
end $$;

-- ---------------------------------------------------------------------------
-- Recruiter view of matches for a job.
-- Returns consenting candidates (approved/applied) with full name, plus
-- interview-vetted candidates who opted in to a domain this job is in, in a
-- reduced form (no name/contact, strengths only, never growth areas).
-- ---------------------------------------------------------------------------
create or replace function public.recruiter_job_matches(p_job_id uuid)
returns table (
  match_id uuid, candidate_id uuid, application_id uuid, status public.match_status, score numeric,
  score_breakdown jsonb, explanation text, consented boolean, full_name text, headline text,
  location text, availability text, experience_years numeric, skills text[], vetted boolean,
  vetted_strengths text[], vetted_domains text[], vetted_source_labels text[], stage public.application_stage
)
language plpgsql stable security definer set search_path = public as $$
declare v_company uuid := public.job_company_id(p_job_id);
begin
  if v_company is null or not public.is_company_member(v_company) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with j as (select * from public.jobs where id = p_job_id),
  vet as (
    select rc.candidate_id,
           array_agg(distinct s) filter (where s is not null) as strengths,
           array_agg(distinct rc.domain) as domains,
           array_agg(distinct rc.source_label) as labels
    from public.redistribution_consent rc
    left join lateral unnest(rc.strengths) s on true
    join public.interview_feedback f on f.id = rc.feedback_id
    , j
    where rc.status = 'opted_in'
      and exists (select 1 from unnest(j.domains) d where lower(d) = lower(rc.domain))
    group by rc.candidate_id
  )
  select m.id, m.candidate_id, a.id, m.status, m.score, m.score_breakdown, m.explanation,
         (m.status in ('approved', 'applied')) as consented,
         case when m.status in ('approved', 'applied') then c.full_name else null end,
         c.headline, c.location, c.availability, c.experience_years,
         coalesce((select array_agg(distinct cs.skill) from public.candidate_skills cs where cs.candidate_id = c.id and cs.source <> 'verified'), '{}'),
         (v.candidate_id is not null), coalesce(v.strengths, '{}'), coalesce(v.domains, '{}'), coalesce(v.labels, '{}'),
         a.stage
  from public.matches m
  join public.candidates c on c.id = m.candidate_id
  left join vet v on v.candidate_id = m.candidate_id
  left join public.applications a on a.match_id = m.id
  where m.job_id = p_job_id
    and not exists (select 1 from public.blocked_companies b where b.candidate_id = c.id and b.company_id = v_company)
    and (
      m.status in ('approved', 'applied')
      or (v.candidate_id is not null and m.status in ('suggested', 'notified') and c.open_to_work and not c.visibility_paused)
    )
  order by (m.status in ('approved', 'applied')) desc, m.score desc;
end $$;

-- ---------------------------------------------------------------------------
-- Admin: read private feedback ONLY with a logged reason.
-- ---------------------------------------------------------------------------
create or replace function public.admin_read_feedback(p_feedback_id uuid, p_reason text)
returns setof public.interview_feedback
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'a reason of at least 10 characters is required' using errcode = '22023';
  end if;
  perform public.write_audit('admin.read_private_feedback', 'interview_feedback', p_feedback_id, jsonb_build_object('reason', btrim(p_reason)));
  return query select * from public.interview_feedback where id = p_feedback_id;
end $$;

create or replace function public.admin_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.users),
    'candidates', (select count(*) from public.users where role = 'candidate'),
    'recruiters', (select count(*) from public.users where role = 'recruiter'),
    'jobs_published', (select count(*) from public.jobs where status = 'published'),
    'jobs_sourced', (select count(*) from public.jobs where source_type = 'sourced' and status = 'published'),
    'matches', (select count(*) from public.matches),
    'approvals', (select count(*) from public.consent_events where type = 'match_approval' and granted),
    'applications', (select count(*) from public.applications),
    'open_takedowns', (select count(*) from public.takedown_requests where status = 'open')
  );
end $$;

-- ---------------------------------------------------------------------------
-- Privacy: export (GDPR-style). Excludes other people's/internal data.
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cid uuid := public.my_candidate_id();
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select to_jsonb(u) from public.users u where u.id = v_uid),
    'candidate', (select to_jsonb(c) - 'embedding' - 'embedding_hash' from public.candidates c where c.id = v_cid),
    'resumes', coalesce((select jsonb_agg(to_jsonb(r) - 'embedding') from public.resumes r where r.candidate_id = v_cid), '[]'),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('skill', s.skill, 'source', s.source, 'domain', s.domain)) from public.candidate_skills s where s.candidate_id = v_cid), '[]'),
    'experiences', coalesce((select jsonb_agg(to_jsonb(e)) from public.experiences e where e.candidate_id = v_cid), '[]'),
    'education', coalesce((select jsonb_agg(to_jsonb(e)) from public.education e where e.candidate_id = v_cid), '[]'),
    'certifications', coalesce((select jsonb_agg(to_jsonb(e)) from public.certifications e where e.candidate_id = v_cid), '[]'),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('job_id', m.job_id, 'job_title', j.title, 'score', m.score,
        'explanation', m.explanation, 'status', m.status, 'notified_at', m.notified_at, 'responded_at', m.responded_at))
      from public.matches m join public.jobs j on j.id = m.job_id where m.candidate_id = v_cid and m.status <> 'suggested'), '[]'),
    'applications', coalesce((select jsonb_agg(jsonb_build_object('job_id', a.job_id, 'stage', a.stage, 'applied_at', a.applied_at))
      from public.applications a where a.candidate_id = v_cid), '[]'),
    'redistribution', coalesce((select jsonb_agg(jsonb_build_object('domain', r.domain, 'strengths', r.strengths,
        'source_label', r.source_label, 'status', r.status)) from public.redistribution_consent r where r.candidate_id = v_cid), '[]'),
    'consent_events', coalesce((select jsonb_agg(jsonb_build_object('type', ce.type, 'subject_type', ce.subject_type,
        'subject_id', ce.subject_id, 'granted', ce.granted, 'at', ce.created_at)) from public.consent_events ce where ce.candidate_id = v_cid), '[]'),
    'blocked_companies', coalesce((select jsonb_agg(jsonb_build_object('company_id', b.company_id, 'name', co.name))
      from public.blocked_companies b join public.companies co on co.id = b.company_id where b.candidate_id = v_cid), '[]'),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('type', n.type, 'channel', n.channel, 'payload', n.payload,
        'sent_at', n.sent_at)) from public.notifications n where n.user_id = v_uid), '[]')
  );
end $$;

-- ---------------------------------------------------------------------------
-- Privacy: erasure. Trusted backend only. Removes profile, resumes (rows; the
-- server deletes files using the returned paths), embeddings, consents.
-- Audit entries are kept but anonymized. The auth user is deleted by the
-- server afterwards via the Auth admin API.
-- ---------------------------------------------------------------------------
create or replace function public.erase_user(p_user_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_cid uuid;
  v_paths text[];
  v_anon uuid := extensions.gen_random_uuid();
begin
  select id into v_cid from public.candidates where user_id = p_user_id;
  select coalesce(array_agg(storage_path), '{}') into v_paths from public.resumes where candidate_id = v_cid;

  perform set_config('app.erasure', 'on', true);
  -- anonymize audit trail referencing this person
  update public.audit_log set actor = null, metadata = jsonb_build_object('anonymized', true)
    where actor = p_user_id;
  update public.audit_log set entity_id = v_anon, metadata = jsonb_build_object('anonymized', true)
    where entity_id in (p_user_id, v_cid)
       or entity_id in (select id from public.matches where candidate_id = v_cid)
       or entity_id in (select id from public.applications where candidate_id = v_cid)
       or entity_id in (select id from public.redistribution_consent where candidate_id = v_cid);
  delete from public.applications where candidate_id = v_cid;   -- cascades feedback + stage history
  delete from public.consent_events where candidate_id = v_cid;
  delete from public.candidates where id = v_cid;                -- cascades skills, resumes, matches, etc.
  delete from public.notifications where user_id = p_user_id;
  delete from public.company_members where user_id = p_user_id;
  perform set_config('app.erasure', 'off', true);

  insert into public.audit_log(actor, actor_role, action, entity, entity_id, metadata)
  values (null, 'system', 'user.erased', 'users', v_anon, '{}'::jsonb);
  return v_paths;
end $$;

-- Unsubscribe from match emails (trusted backend, after verifying a signed token).
create or replace function public.unsubscribe_candidate(p_candidate_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.candidates set match_emails_enabled = false where id = p_candidate_id;
  insert into public.consent_events(candidate_id, type, subject_type, subject_id, granted)
  values (p_candidate_id, 'match_emails_unsubscribe', 'candidate', p_candidate_id, false);
  perform public.write_audit('candidate.unsubscribed', 'candidates', p_candidate_id, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window). Returns true when the call is allowed.
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  insert into public.rate_limits(key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else public.rate_limits.count + 1 end,
    window_start = case when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else public.rate_limits.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end $$;

-- ---------------------------------------------------------------------------
-- Matching engine: hard filters + vector similarity (Section 7 steps 1-2)
-- ---------------------------------------------------------------------------
create or replace function public.candidate_passes_hard_filters(p_job public.jobs, p_cand public.candidates) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select
    p_cand.claim_status = 'claimed'
    and p_cand.open_to_work and not p_cand.visibility_paused
    and exists (select 1 from public.users u where u.id = p_cand.user_id and u.status = 'active' and u.role = 'candidate')
    and (p_job.company_id is null or not exists (
          select 1 from public.blocked_companies b where b.candidate_id = p_cand.id and b.company_id = p_job.company_id))
    -- work mode: candidate has no preference or accepts the job's mode
    and (cardinality(p_cand.work_mode_pref) = 0 or p_job.work_mode = any (p_cand.work_mode_pref))
    -- location: remote jobs are location-agnostic; otherwise city must be compatible
    and (
      p_job.work_mode = 'remote' or p_job.location is null or btrim(p_job.location) = ''
      or (p_cand.location is not null and (
            lower(p_cand.location) like '%' || lower(btrim(split_part(p_job.location, ',', 1))) || '%'
            or lower(p_job.location) like '%' || lower(btrim(split_part(p_cand.location, ',', 1))) || '%'))
      or exists (select 1 from unnest(p_cand.preferred_locations) pl
                 where lower(p_job.location) like '%' || lower(btrim(split_part(pl, ',', 1))) || '%')
    )
    and p_cand.experience_years >= coalesce(p_job.min_exp, 0)
    and not exists (
      select 1 from unnest(p_job.required_certifications) rc
      where not exists (select 1 from public.certifications c
                        where c.candidate_id = p_cand.id and lower(c.name) like '%' || lower(btrim(rc)) || '%'))
$$;

create or replace function public.match_candidates_for_job(p_job_id uuid, p_limit integer default 50)
returns table (candidate_id uuid, similarity double precision)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, 1 - (c.embedding <=> j.embedding)
  from public.jobs j
  join public.candidates c on c.embedding is not null
  where j.id = p_job_id and j.embedding is not null and j.status = 'published'
    and public.candidate_passes_hard_filters(j, c)
  order by c.embedding <=> j.embedding
  limit p_limit
$$;

create or replace function public.match_jobs_for_candidate(p_candidate_id uuid, p_limit integer default 50)
returns table (job_id uuid, similarity double precision)
language sql stable security definer set search_path = public, extensions as $$
  select j.id, 1 - (c.embedding <=> j.embedding)
  from public.candidates c
  join public.jobs j on j.embedding is not null and j.status = 'published' and (j.expires_at is null or j.expires_at > now())
  where c.id = p_candidate_id and c.embedding is not null
    and public.candidate_passes_hard_filters(j, c)
  order by c.embedding <=> j.embedding
  limit p_limit
$$;

-- Idempotent upsert: never resets status, never re-scores a match already sent.
create or replace function public.upsert_match(
  p_job_id uuid, p_candidate_id uuid, p_score numeric, p_breakdown jsonb, p_explanation text, p_is_vetted boolean
) returns uuid
language sql security definer set search_path = public as $$
  insert into public.matches(job_id, candidate_id, score, score_breakdown, explanation, is_vetted)
  values (p_job_id, p_candidate_id, p_score, p_breakdown, p_explanation, p_is_vetted)
  on conflict (job_id, candidate_id) do update
    set score = excluded.score, score_breakdown = excluded.score_breakdown,
        explanation = excluded.explanation, is_vetted = excluded.is_vetted
    where public.matches.status = 'suggested'
  returning id
$$;

create or replace function public.mark_match_notified(p_match_id uuid, p_expiry_days integer default 14) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.matches set status = 'notified', notified_at = now(),
    expires_at = now() + make_interval(days => p_expiry_days)
  where id = p_match_id and status = 'suggested';
  return found;
end $$;

-- Cron: expire unanswered matches and stale jobs. Returns counts.
create or replace function public.run_expiry() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_matches integer; v_jobs integer;
begin
  update public.matches set status = 'expired' where status = 'notified' and expires_at is not null and expires_at <= now();
  get diagnostics v_matches = row_count;
  update public.jobs set status = 'expired' where status = 'published' and expires_at is not null and expires_at <= now();
  get diagnostics v_jobs = row_count;
  return jsonb_build_object('matches_expired', v_matches, 'jobs_expired', v_jobs);
end $$;

-- Sourced-job duplicate detection: title + company + location + summary similarity.
create or replace function public.find_duplicate_jobs(
  p_title text, p_company text, p_location text, p_summary text, p_exclude uuid default null
) returns table (job_id uuid, title text, company text, location text, similarity real)
language sql stable security definer set search_path = public, extensions as $$
  select j.id, j.title, coalesce(j.source_company_name, co.name), j.location,
         extensions.similarity(lower(j.title || ' ' || coalesce(j.description_summary, '')), lower(p_title || ' ' || coalesce(p_summary, '')))
  from public.jobs j
  left join public.companies co on co.id = j.company_id
  where j.status in ('draft', 'published', 'paused')
    and (p_exclude is null or j.id <> p_exclude)
    and extensions.similarity(lower(j.title), lower(p_title)) > 0.5
    and (p_company is null or extensions.similarity(lower(coalesce(j.source_company_name, co.name, '')), lower(p_company)) > 0.5)
    and (p_location is null or j.location is null or extensions.similarity(lower(j.location), lower(p_location)) > 0.4)
  order by 5 desc
  limit 5
$$;

-- ---------------------------------------------------------------------------
-- Privileges: service-only functions
-- ---------------------------------------------------------------------------
revoke execute on function
  public.erase_user(uuid),
  public.unsubscribe_candidate(uuid),
  public.check_rate_limit(text, integer, integer),
  public.match_candidates_for_job(uuid, integer),
  public.match_jobs_for_candidate(uuid, integer),
  public.candidate_passes_hard_filters(public.jobs, public.candidates),
  public.upsert_match(uuid, uuid, numeric, jsonb, text, boolean),
  public.mark_match_notified(uuid, integer),
  public.run_expiry(),
  public.find_duplicate_jobs(text, text, text, text, uuid),
  public.write_audit(text, text, uuid, jsonb)
from public, anon, authenticated;

revoke execute on function
  public.choose_role(text, text), public.create_company(text, text, text, text, text),
  public.add_company_member(uuid, text, text), public.respond_to_match(uuid, text, text, text, uuid),
  public.set_redistribution_consent(uuid, text, text, text), public.recruiter_job_matches(uuid),
  public.admin_read_feedback(uuid, text), public.admin_counts(), public.export_my_data()
from public, anon;
