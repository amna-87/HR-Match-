-- M1: helper functions + integrity triggers.
-- Security-critical rules are enforced HERE, in the database, not only in app code.

-- ---------------------------------------------------------------------------
-- Session helpers
-- ---------------------------------------------------------------------------
-- True when the current connection is a trusted backend (service role / migrations),
-- false for end-user API roles (anon / authenticated).
create or replace function public.is_trusted_backend() returns boolean
language sql stable as $$
  select current_user not in ('anon', 'authenticated')
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and status = 'active'
  )
$$;

create or replace function public.my_candidate_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.candidates where user_id = auth.uid()
$$;

create or replace function public.my_company_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select cm.company_id from public.company_members cm
  join public.users u on u.id = cm.user_id
  join public.companies c on c.id = cm.company_id
  where cm.user_id = auth.uid() and u.status = 'active' and c.status = 'active'
$$;

create or replace function public.is_company_member(p_company_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_company_id is not null and p_company_id in (select public.my_company_ids())
$$;

create or replace function public.is_company_admin(p_company_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members cm
    join public.users u on u.id = cm.user_id
    where cm.company_id = p_company_id and cm.user_id = auth.uid()
      and cm.role = 'admin' and u.status = 'active'
  )
$$;

-- A recruiter's company may see a candidate's full profile ONLY when that
-- candidate has a consented application to one of the company's jobs and has
-- not blocked the company.
create or replace function public.company_can_view_candidate(p_candidate_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.candidate_id = p_candidate_id
      and j.company_id in (select public.my_company_ids())
      and not exists (
        select 1 from public.blocked_companies b
        where b.candidate_id = p_candidate_id and b.company_id = j.company_id
      )
  )
$$;

create or replace function public.job_company_id(p_job_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.jobs where id = p_job_id
$$;

create or replace function public.application_company_id(p_application_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select j.company_id from public.applications a join public.jobs j on j.id = a.job_id
  where a.id = p_application_id
$$;

-- ---------------------------------------------------------------------------
-- Audit helper (append-only log)
-- ---------------------------------------------------------------------------
create or replace function public.write_audit(
  p_action text, p_entity text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role::text into v_role from public.users where id = auth.uid();
  insert into public.audit_log(actor, actor_role, action, entity, entity_id, metadata)
  values (auth.uid(), coalesce(v_role, case when public.is_trusted_backend() then 'system' else 'anonymous' end),
          p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Append-only tables (consent_events, audit_log)
-- Erasure (account deletion) is the single exception and is only possible from
-- the trusted backend inside erase_candidate(), which sets app.erasure.
-- ---------------------------------------------------------------------------
create or replace function public.forbid_mutation() returns trigger
language plpgsql as $$
begin
  if public.is_trusted_backend() and current_setting('app.erasure', true) = 'on' then
    return coalesce(new, old);
  end if;
  raise exception '% is append-only', tg_table_name using errcode = 'P0001';
end $$;

create trigger consent_events_append_only before update or delete on public.consent_events
  for each row execute function public.forbid_mutation();
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- New auth user -> public.users (+ candidate profile)
-- Role is taken from signup metadata; 'admin' can never be self-assigned.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := new.raw_user_meta_data ->> 'role';
  v_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
begin
  if v_role in ('candidate', 'recruiter') then
    insert into public.users(id, role, email, onboarded) values (new.id, v_role::public.user_role, coalesce(new.email, ''), true);
    if v_role = 'candidate' then
      insert into public.candidates(user_id, claim_status, full_name) values (new.id, 'claimed', v_name);
    end if;
  else
    -- e.g. Google OAuth: user picks a role on /onboarding (choose_role()).
    insert into public.users(id, role, email, onboarded) values (new.id, 'candidate', coalesce(new.email, ''), false);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Users cannot change their own role/status/email via the API.
create or replace function public.guard_users_update() returns trigger
language plpgsql as $$
begin
  if not public.is_trusted_backend() then
    if new.role is distinct from old.role or new.status is distinct from old.status
       or new.email is distinct from old.email or new.onboarded is distinct from old.onboarded
       or new.id is distinct from old.id then
      raise exception 'not allowed to change protected user fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger guard_users_update before update on public.users
  for each row execute function public.guard_users_update();

create or replace function public.guard_candidates_update() returns trigger
language plpgsql as $$
begin
  if not public.is_trusted_backend() then
    if new.user_id is distinct from old.user_id or new.claim_status is distinct from old.claim_status
       or new.embedding is distinct from old.embedding or new.embedding_hash is distinct from old.embedding_hash then
      raise exception 'not allowed to change protected candidate fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger guard_candidates_update before update on public.candidates
  for each row execute function public.guard_candidates_update();

-- Verified skills are created only by the trusted backend / security-definer
-- consent functions (which run as the function owner, i.e. a trusted role).
create or replace function public.guard_candidate_skills() returns trigger
language plpgsql as $$
begin
  if not public.is_trusted_backend() then
    if (tg_op in ('INSERT', 'UPDATE') and new.source = 'verified')
       or (tg_op in ('UPDATE', 'DELETE') and old.source = 'verified') then
      raise exception 'verified skills are managed by the platform' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_candidate_skills before insert or update or delete on public.candidate_skills
  for each row execute function public.guard_candidate_skills();

-- Jobs: API users cannot touch embeddings or forge the source type.
create or replace function public.guard_jobs() returns trigger
language plpgsql as $$
begin
  if not public.is_trusted_backend() then
    if tg_op = 'INSERT' then
      new.embedding := null; new.embedding_hash := null;
      new.created_by := auth.uid();
    elsif new.embedding is distinct from old.embedding or new.embedding_hash is distinct from old.embedding_hash
          or new.source_type is distinct from old.source_type or new.company_id is distinct from old.company_id then
      raise exception 'not allowed to change protected job fields' using errcode = '42501';
    end if;
    -- Recruiters can't resurrect a job removed by takedown/moderation.
    if tg_op = 'UPDATE' and old.status = 'removed' and not public.is_platform_admin() then
      raise exception 'job was removed by moderation' using errcode = '42501';
    end if;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
    if new.source_type = 'sourced' and new.expires_at is null then
      new.expires_at := now() + interval '30 days';
    end if;
  end if;
  if new.status = 'published' and (
       tg_op = 'INSERT' or old.status is distinct from 'published'
       or (new.title, new.description_summary, new.required_skills, new.nice_skills, new.required_certifications,
           new.domains, new.min_exp, new.max_exp, new.location, new.work_mode)
          is distinct from
          (old.title, old.description_summary, old.required_skills, old.nice_skills, old.required_certifications,
           old.domains, old.min_exp, old.max_exp, old.location, old.work_mode)) then
    new.needs_matching := true;
  end if;
  return new;
end $$;
create trigger guard_jobs before insert or update on public.jobs
  for each row execute function public.guard_jobs();

create or replace function public.audit_jobs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('job.created', 'jobs', new.id, jsonb_build_object('status', new.status, 'source_type', new.source_type));
  elsif new.status is distinct from old.status then
    perform public.write_audit('job.status_changed', 'jobs', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger audit_jobs after insert or update on public.jobs
  for each row execute function public.audit_jobs();

-- ---------------------------------------------------------------------------
-- Match state machine (Section 8)
--   verified: suggested -> notified -> (approved -> applied) | declined | expired
--   sourced:  suggested -> notified -> viewed   (also notified -> expired)
-- ---------------------------------------------------------------------------
create or replace function public.match_transition_allowed(
  p_source public.job_source_type, p_from public.match_status, p_to public.match_status
) returns boolean
language sql immutable as $$
  select case
    when p_from = p_to then true
    when p_source = 'verified' then (p_from, p_to) in (
      ('suggested'::public.match_status, 'notified'::public.match_status),
      ('notified', 'approved'), ('notified', 'declined'), ('notified', 'expired'),
      ('approved', 'applied')
    )
    else (p_from, p_to) in (
      ('suggested'::public.match_status, 'notified'::public.match_status),
      ('notified', 'viewed'), ('notified', 'expired')
    )
  end
$$;

create or replace function public.guard_matches() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_source public.job_source_type;
begin
  select source_type into v_source from public.jobs where id = new.job_id;
  if tg_op = 'INSERT' then
    if new.status <> 'suggested' then
      raise exception 'matches must start as suggested' using errcode = 'P0001';
    end if;
    perform public.write_audit('match.created', 'matches', new.id, jsonb_build_object('job_id', new.job_id, 'score', new.score));
    return new;
  end if;
  if new.job_id is distinct from old.job_id or new.candidate_id is distinct from old.candidate_id then
    raise exception 'match identity is immutable' using errcode = 'P0001';
  end if;
  if not public.match_transition_allowed(v_source, old.status, new.status) then
    raise exception 'invalid match transition % -> % (%)', old.status, new.status, v_source using errcode = 'P0001';
  end if;
  -- approved requires a granted consent event for this match
  if new.status = 'approved' and old.status <> 'approved' and not exists (
    select 1 from public.consent_events ce
    where ce.subject_type = 'match' and ce.subject_id = new.id and ce.type = 'match_approval'
      and ce.granted and ce.candidate_id = new.candidate_id
  ) then
    raise exception 'cannot approve a match without a consent event' using errcode = 'P0001';
  end if;
  -- scores of matches that were already sent are frozen
  if old.status <> 'suggested' and (new.score is distinct from old.score or new.score_breakdown is distinct from old.score_breakdown) then
    new.score := old.score; new.score_breakdown := old.score_breakdown; new.explanation := old.explanation;
  end if;
  if new.status is distinct from old.status then
    perform public.write_audit('match.status_changed', 'matches', new.id,
      jsonb_build_object('from', old.status, 'to', new.status, 'job_id', new.job_id));
  end if;
  return new;
end $$;
create trigger guard_matches before insert or update on public.matches
  for each row execute function public.guard_matches();

-- ---------------------------------------------------------------------------
-- Applications: NO application without a prior approved consent event.
-- ---------------------------------------------------------------------------
create or replace function public.guard_applications_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ce public.consent_events;
  v_job public.jobs;
  v_match public.matches;
begin
  select * into v_ce from public.consent_events where id = new.consent_event_id;
  if v_ce.id is null or not v_ce.granted or v_ce.type <> 'match_approval'
     or v_ce.candidate_id is distinct from new.candidate_id then
    raise exception 'application requires an approved consent event from the candidate' using errcode = 'P0001';
  end if;
  select * into v_job from public.jobs where id = new.job_id;
  if v_job.source_type <> 'verified' then
    raise exception 'sourced jobs never receive in-platform applications' using errcode = 'P0001';
  end if;
  if new.match_id is not null then
    select * into v_match from public.matches where id = new.match_id;
    if v_match.id is null or v_match.candidate_id <> new.candidate_id or v_match.job_id <> new.job_id
       or v_match.status <> 'approved' or v_ce.subject_id <> new.match_id then
      raise exception 'application must reference the approved match it was consented for' using errcode = 'P0001';
    end if;
  elsif v_ce.subject_id <> new.job_id then
    raise exception 'consent event does not cover this job' using errcode = 'P0001';
  end if;
  new.stage := 'new';
  return new;
end $$;
create trigger guard_applications_insert before insert on public.applications
  for each row execute function public.guard_applications_insert();

create or replace function public.guard_applications_update() returns trigger
language plpgsql as $$
begin
  if new.job_id is distinct from old.job_id or new.candidate_id is distinct from old.candidate_id
     or new.consent_event_id is distinct from old.consent_event_id or new.match_id is distinct from old.match_id
     or new.applied_at is distinct from old.applied_at then
    raise exception 'application identity is immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger guard_applications_update before update on public.applications
  for each row execute function public.guard_applications_update();

create or replace function public.track_application_stage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_stage_history(application_id, from_stage, to_stage, changed_by)
    values (new.id, null, new.stage, auth.uid());
    perform public.write_audit('application.created', 'applications', new.id,
      jsonb_build_object('job_id', new.job_id, 'match_id', new.match_id, 'consent_event_id', new.consent_event_id));
  elsif new.stage is distinct from old.stage then
    insert into public.application_stage_history(application_id, from_stage, to_stage, changed_by)
    values (new.id, old.stage, new.stage, auth.uid());
    perform public.write_audit('application.stage_changed', 'applications', new.id,
      jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  return new;
end $$;
create trigger track_application_stage after insert or update on public.applications
  for each row execute function public.track_application_stage();

-- ---------------------------------------------------------------------------
-- Interview feedback -> redistribution offers (Section 5.7)
-- ---------------------------------------------------------------------------
create or replace function public.before_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.company_id := public.application_company_id(new.application_id);
  if new.company_id is null then
    raise exception 'unknown application' using errcode = 'P0001';
  end if;
  if not public.is_trusted_backend() then
    new.recruiter_id := auth.uid();
  end if;
  -- normalize tags
  new.strengths := coalesce((select array_agg(distinct btrim(s)) from unnest(new.strengths) s where btrim(s) <> ''), '{}');
  new.suggested_domains := coalesce((select array_agg(distinct btrim(s)) from unnest(new.suggested_domains) s where btrim(s) <> ''), '{}');
  new.growth_areas := coalesce((select array_agg(distinct btrim(s)) from unnest(new.growth_areas) s where btrim(s) <> ''), '{}');
  if new.outcome = 'good_fit_different_role' and cardinality(new.suggested_domains) = 0 then
    raise exception 'good_fit_different_role requires at least one suggested domain' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger before_feedback before insert or update on public.interview_feedback
  for each row execute function public.before_feedback();

create or replace function public.after_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_app public.applications;
  v_company public.companies;
  v_job public.jobs;
  v_label text;
  v_domain text;
  v_user uuid;
begin
  select * into v_app from public.applications where id = new.application_id;
  select * into v_job from public.jobs where id = v_app.job_id;
  select * into v_company from public.companies where id = new.company_id;
  v_label := case when v_company.show_name_on_vetted_badge then v_company.name else 'a previous employer''s recruiter' end;

  if new.outcome = 'good_fit_different_role' then
    foreach v_domain in array new.suggested_domains loop
      insert into public.redistribution_consent(candidate_id, feedback_id, domain, strengths, source_label)
      values (v_app.candidate_id, new.id, v_domain, new.strengths, v_label)
      on conflict (feedback_id, domain) do update set strengths = excluded.strengths, source_label = excluded.source_label;
    end loop;
    if tg_op = 'INSERT' and v_app.stage not in ('hired', 'redirected') then
      update public.applications set stage = 'redirected' where id = v_app.id;
    end if;
    select user_id into v_user from public.candidates where id = v_app.candidate_id;
    if v_user is not null and tg_op = 'INSERT' then
      -- in-app notice. Payload contains ONLY candidate-safe fields.
      insert into public.notifications(user_id, type, channel, payload, delivery_status, sent_at)
      values (v_user, 'redistribution_offer', 'in_app', jsonb_build_object(
        'source_label', v_label, 'job_title', v_job.title,
        'domains', to_jsonb(new.suggested_domains), 'strengths', to_jsonb(new.strengths)
      ), 'sent', now());
      -- email copy is queued; the notifier sends it if the candidate allows email
      insert into public.notifications(user_id, type, channel, payload, delivery_status)
      values (v_user, 'redistribution_offer', 'email', jsonb_build_object(
        'source_label', v_label, 'job_title', v_job.title,
        'domains', to_jsonb(new.suggested_domains), 'strengths', to_jsonb(new.strengths)
      ), 'pending');
    end if;
  elsif tg_op = 'INSERT' and v_app.stage not in ('hired', 'rejected') then
    update public.applications set stage = 'rejected' where id = v_app.id;
  end if;

  -- audit WITHOUT internal content
  perform public.write_audit(case when tg_op = 'INSERT' then 'feedback.created' else 'feedback.updated' end,
    'interview_feedback', new.id, jsonb_build_object('application_id', new.application_id, 'outcome', new.outcome));
  return new;
end $$;
create trigger after_feedback after insert or update on public.interview_feedback
  for each row execute function public.after_feedback();

create or replace function public.audit_redistribution() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('redistribution.offered', 'redistribution_consent', new.id, jsonb_build_object('domain', new.domain));
  elsif new.status is distinct from old.status then
    perform public.write_audit('redistribution.status_changed', 'redistribution_consent', new.id,
      jsonb_build_object('from', old.status, 'to', new.status, 'domain', new.domain));
  end if;
  return new;
end $$;
create trigger audit_redistribution after insert or update on public.redistribution_consent
  for each row execute function public.audit_redistribution();

create or replace function public.audit_takedown() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('takedown.requested', 'takedown_requests', new.id, jsonb_build_object('job_id', new.job_id));
  elsif new.status is distinct from old.status then
    perform public.write_audit('takedown.' || new.status::text, 'takedown_requests', new.id,
      jsonb_build_object('job_id', new.job_id, 'note', new.resolution_note));
  end if;
  return new;
end $$;
create trigger audit_takedown after insert or update on public.takedown_requests
  for each row execute function public.audit_takedown();

-- Candidate material changes flag the profile for re-matching.
create or replace function public.flag_candidate_rematch() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.candidate_id, old.candidate_id);
begin
  update public.candidates set needs_matching = true where id = v_id and not needs_matching;
  return coalesce(new, old);
end $$;
create trigger rematch_on_skills after insert or update or delete on public.candidate_skills
  for each row execute function public.flag_candidate_rematch();
create trigger rematch_on_experiences after insert or update or delete on public.experiences
  for each row execute function public.flag_candidate_rematch();
create trigger rematch_on_certifications after insert or update or delete on public.certifications
  for each row execute function public.flag_candidate_rematch();

create or replace function public.flag_candidate_self_rematch() returns trigger
language plpgsql as $$
begin
  if (new.headline, new.summary, new.location, new.work_mode_pref, new.desired_roles, new.preferred_locations,
      new.open_to_work, new.visibility_paused, new.experience_years)
     is distinct from
     (old.headline, old.summary, old.location, old.work_mode_pref, old.desired_roles, old.preferred_locations,
      old.open_to_work, old.visibility_paused, old.experience_years) then
    new.needs_matching := true;
  end if;
  return new;
end $$;
create trigger rematch_on_candidate before update on public.candidates
  for each row execute function public.flag_candidate_self_rematch();
