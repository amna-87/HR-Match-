-- Privacy (v1.0 section 9): the data export also covers launch features:
-- saved jobs, introduction requests, and profiles recruiters hold about you
-- in their talent pools (matched on your verified email).
alter function public.export_my_data() rename to export_my_data_base;
revoke execute on function public.export_my_data_base() from public, anon, authenticated;

create or replace function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_base jsonb;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  v_base := public.export_my_data_base();
  return v_base || jsonb_build_object(
    'saved_jobs', coalesce((select jsonb_agg(jsonb_build_object('job_id', s.job_id, 'title', j.title, 'saved_at', s.created_at))
      from public.saved_jobs s join public.jobs j on j.id = s.job_id where s.user_id = v_uid), '[]'),
    'introduction_requests', coalesce((select jsonb_agg(to_jsonb(r)) from public.my_introduction_requests() r), '[]'),
    'profiles_in_recruiter_pools', coalesce((select jsonb_agg(jsonb_build_object(
        'recruiter', r.company_name, 'headline', p.headline, 'skills', p.skills, 'location', p.location,
        'contact_email', p.contact_email, 'contact_phone', p.contact_phone, 'added_at', p.created_at))
      from public.my_uploaded_profiles() r join public.pool_candidates p on p.id = r.id), '[]')
  );
end $$;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
