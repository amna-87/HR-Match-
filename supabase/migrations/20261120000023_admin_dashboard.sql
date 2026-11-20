-- Admin dashboard: one call that returns every platform stat the admin home shows.
-- Aggregates only (no names, emails or resume content). Admin-only; reading it is
-- not audited because it exposes no personal data. See D-040.
create or replace function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_days int := 30;
begin
  if not public.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'jobs', (select jsonb_build_object(
        'total', count(*),
        'published', count(*) filter (where status = 'published'),
        'draft', count(*) filter (where status = 'draft'),
        'paused', count(*) filter (where status = 'paused'),
        'closed', count(*) filter (where status in ('closed', 'expired')),
        'removed', count(*) filter (where status = 'removed'),
        'public', count(*) filter (where status = 'published' and visibility = 'public'),
        'workspace_only', count(*) filter (where status = 'published' and visibility <> 'public'),
        'employer', count(*) filter (where status = 'published' and source_type = 'verified'),
        'sourced', count(*) filter (where status = 'published' and source_type = 'sourced'),
        'from_feeds', count(*) filter (where status = 'published' and feed_id is not null),
        'awaiting_public_review', count(*) filter (where public_requested_at is not null and visibility <> 'public'),
        'new_7d', count(*) filter (where created_at > now() - interval '7 days')
      ) from public.jobs),
    'candidates', (select jsonb_build_object(
        'accounts', (select count(*) from public.users where role = 'candidate'),
        'with_resume', (select count(distinct c.id) from public.candidates c
                        join public.resumes r on r.candidate_id = c.id where c.user_id is not null),
        'matched', (select count(distinct m.candidate_id) from public.matches m
                    join public.candidates c on c.id = m.candidate_id where c.user_id is not null),
        'approved', (select count(distinct candidate_id) from public.matches where status in ('approved', 'applied')),
        'applied', (select count(distinct candidate_id) from public.applications),
        'logged_in_ever', (select count(*) from public.users u join auth.users a on a.id = u.id
                           where u.role = 'candidate' and a.last_sign_in_at is not null),
        'logged_in_7d', (select count(*) from public.users u join auth.users a on a.id = u.id
                         where u.role = 'candidate' and a.last_sign_in_at > now() - interval '7 days'),
        'logged_in_30d', (select count(*) from public.users u join auth.users a on a.id = u.id
                          where u.role = 'candidate' and a.last_sign_in_at > now() - interval '30 days'),
        'new_7d', (select count(*) from public.users where role = 'candidate' and created_at > now() - interval '7 days')
      )),
    'recruiters', (select jsonb_build_object(
        'accounts', (select count(*) from public.users where role = 'recruiter'),
        'workspaces', (select count(*) from public.companies),
        'logged_in_ever', (select count(*) from public.users u join auth.users a on a.id = u.id
                           where u.role = 'recruiter' and a.last_sign_in_at is not null),
        'logged_in_7d', (select count(*) from public.users u join auth.users a on a.id = u.id
                         where u.role = 'recruiter' and a.last_sign_in_at > now() - interval '7 days'),
        'logged_in_30d', (select count(*) from public.users u join auth.users a on a.id = u.id
                          where u.role = 'recruiter' and a.last_sign_in_at > now() - interval '30 days'),
        'new_7d', (select count(*) from public.users where role = 'recruiter' and created_at > now() - interval '7 days')
      )),
    'pool', (select jsonb_build_object(
        'profiles', (select count(*) from public.pool_candidates),
        'shared', (select count(*) from public.pool_candidates p join public.companies c on c.id = p.workspace_id
                   where c.share_pool_anonymously),
        'introductions', (select count(*) from public.intro_requests),
        'introduced', (select count(*) from public.intro_requests where status = 'accepted')
      )),
    'matching', (select jsonb_build_object(
        'matches', count(*),
        'waiting', count(*) filter (where status in ('notified', 'viewed')),
        'approved', count(*) filter (where status in ('approved', 'applied')),
        'declined', count(*) filter (where status = 'declined'),
        'applications', (select count(*) from public.applications),
        'hired', (select count(*) from public.applications where stage = 'hired')
      ) from public.matches),
    'open_takedowns', (select count(*) from public.takedown_requests where status = 'open'),
    -- daily series for the last 30 days (oldest first)
    'daily', (select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'jobs', (select count(*) from public.jobs where created_at >= d and created_at < d + interval '1 day'),
        'candidates', (select count(*) from public.users where role = 'candidate' and created_at >= d and created_at < d + interval '1 day'),
        'recruiters', (select count(*) from public.users where role = 'recruiter' and created_at >= d and created_at < d + interval '1 day'),
        'matches', (select count(*) from public.matches where created_at >= d and created_at < d + interval '1 day')
      ) order by d)
      from generate_series(date_trunc('day', now()) - (v_days - 1) * interval '1 day', date_trunc('day', now()), interval '1 day') d),
    'top_workspaces', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select c.name, count(j.id) filter (where j.status = 'published') as open_jobs,
               (select count(*) from public.pool_candidates p where p.workspace_id = c.id) as pool
        from public.companies c left join public.jobs j on j.owner_workspace_id = c.id or j.company_id = c.id
        group by c.id, c.name order by 2 desc, 3 desc limit 5) t),
    'generated_at', now()
  );
end $$;
revoke execute on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;
