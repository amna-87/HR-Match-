-- M1: Row Level Security policies (Section 4 + 9).
-- Default deny: a table with RLS enabled and no matching policy returns no rows.
-- Platform admins do NOT get blanket read access to private recruiter notes
-- (interview_feedback): that goes through admin_read_feedback() which logs a reason.

-- users ----------------------------------------------------------------------
create policy users_select_self on public.users for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- candidates -----------------------------------------------------------------
create policy candidates_select on public.candidates for select to authenticated
  using (user_id = auth.uid() or public.company_can_view_candidate(id));
create policy candidates_update_self on public.candidates for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- resumes: owner only (recruiters get short-lived signed URLs from the server
-- after an application check; admins via logged server actions)
create policy resumes_owner_all on public.resumes for all to authenticated
  using (candidate_id = public.my_candidate_id())
  with check (candidate_id = public.my_candidate_id());

-- candidate-linked rows ------------------------------------------------------
create policy skills_owner_all on public.candidate_skills for all to authenticated
  using (candidate_id = public.my_candidate_id()) with check (candidate_id = public.my_candidate_id());
create policy skills_company_select on public.candidate_skills for select to authenticated
  using (public.company_can_view_candidate(candidate_id));

create policy experiences_owner_all on public.experiences for all to authenticated
  using (candidate_id = public.my_candidate_id()) with check (candidate_id = public.my_candidate_id());
create policy experiences_company_select on public.experiences for select to authenticated
  using (public.company_can_view_candidate(candidate_id));

create policy education_owner_all on public.education for all to authenticated
  using (candidate_id = public.my_candidate_id()) with check (candidate_id = public.my_candidate_id());
create policy education_company_select on public.education for select to authenticated
  using (public.company_can_view_candidate(candidate_id));

create policy certifications_owner_all on public.certifications for all to authenticated
  using (candidate_id = public.my_candidate_id()) with check (candidate_id = public.my_candidate_id());
create policy certifications_company_select on public.certifications for select to authenticated
  using (public.company_can_view_candidate(candidate_id));

-- companies ------------------------------------------------------------------
-- Company profiles are public-facing (name/website shown on jobs).
create policy companies_select on public.companies for select to anon, authenticated
  using (status = 'active' or public.is_company_member(id) or public.is_platform_admin());
create policy companies_update_admin on public.companies for update to authenticated
  using (public.is_company_admin(id)) with check (public.is_company_admin(id));
-- inserts go through create_company()

create policy company_members_select on public.company_members for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());
create policy company_members_admin_delete on public.company_members for delete to authenticated
  using (public.is_company_admin(company_id) and user_id <> auth.uid());
-- inserts go through add_company_member()

-- jobs -----------------------------------------------------------------------
create policy jobs_select_published on public.jobs for select to anon, authenticated
  using (status = 'published' and (expires_at is null or expires_at > now()));
create policy jobs_select_company on public.jobs for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());
create policy jobs_insert_company on public.jobs for insert to authenticated
  with check (source_type = 'verified' and public.is_company_member(company_id));
create policy jobs_update_company on public.jobs for update to authenticated
  using (source_type = 'verified' and public.is_company_member(company_id))
  with check (source_type = 'verified' and public.is_company_member(company_id));
create policy jobs_admin_all on public.jobs for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- matches --------------------------------------------------------------------
-- Candidates see their own matches once notified (nothing is "sent" before that).
create policy matches_select_candidate on public.matches for select to authenticated
  using (candidate_id = public.my_candidate_id() and status <> 'suggested');
-- Recruiters see only candidates who said yes. Vetted (opted-in) candidates
-- are surfaced in a reduced form via recruiter_job_matches().
create policy matches_select_company on public.matches for select to authenticated
  using (status in ('approved', 'applied') and public.is_company_member(public.job_company_id(job_id)));
-- No insert/update/delete policies: state changes go through security-definer functions.

-- applications -----------------------------------------------------------------
create policy applications_select_candidate on public.applications for select to authenticated
  using (candidate_id = public.my_candidate_id());
create policy applications_select_company on public.applications for select to authenticated
  using (public.is_company_member(public.job_company_id(job_id)));
create policy applications_update_company on public.applications for update to authenticated
  using (public.is_company_member(public.job_company_id(job_id)))
  with check (public.is_company_member(public.job_company_id(job_id)));
-- No insert policy: applications are only created by respond_to_match().

create policy stage_history_select_company on public.application_stage_history for select to authenticated
  using (public.is_company_member(public.application_company_id(application_id)));

-- interview_feedback: INTERNAL to the reviewing company --------------------------
create policy feedback_company_select on public.interview_feedback for select to authenticated
  using (public.is_company_member(company_id));
create policy feedback_company_insert on public.interview_feedback for insert to authenticated
  with check (public.is_company_member(public.application_company_id(application_id)));
create policy feedback_company_update on public.interview_feedback for update to authenticated
  using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

-- redistribution_consent: candidate-facing projection (no growth areas / notes) -----
create policy redistribution_select_candidate on public.redistribution_consent for select to authenticated
  using (candidate_id = public.my_candidate_id());
-- status changes go through set_redistribution_consent()

-- consent_events (append-only) -------------------------------------------------
create policy consent_select_candidate on public.consent_events for select to authenticated
  using (candidate_id = public.my_candidate_id());

-- notifications -----------------------------------------------------------------
create policy notifications_select_self on public.notifications for select to authenticated
  using (user_id = auth.uid() and channel = 'in_app');
create policy notifications_update_self on public.notifications for update to authenticated
  using (user_id = auth.uid() and channel = 'in_app') with check (user_id = auth.uid() and channel = 'in_app');

-- audit_log: platform admins only ------------------------------------------------
create policy audit_select_admin on public.audit_log for select to authenticated
  using (public.is_platform_admin());

-- blocked_companies ---------------------------------------------------------------
create policy blocked_owner_all on public.blocked_companies for all to authenticated
  using (candidate_id = public.my_candidate_id()) with check (candidate_id = public.my_candidate_id());

-- takedown_requests: admins only (public submissions go through the server, rate-limited)
create policy takedown_admin_all on public.takedown_requests for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- rate_limits: no policies (service role only)

-- Column-level hardening: notifications can only have read_at changed by users.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
-- Applications: recruiters may only change the stage.
revoke update on public.applications from authenticated;
grant update (stage) on public.applications to authenticated;
-- Never let API roles write to these directly.
revoke insert, update, delete on public.consent_events, public.audit_log, public.matches,
  public.application_stage_history, public.rate_limits, public.redistribution_consent
  from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
