-- Admin feeds can publish straight to the public job board (D-034/D-037 follow-up).
alter table public.job_feeds add column publish_public boolean not null default false;

-- Only Vouch admins can turn this on (members can still pause/resume).
create or replace function public.guard_job_feeds() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_trusted_backend() and (
       new.workspace_id is distinct from old.workspace_id or new.provider is distinct from old.provider
       or new.board is distinct from old.board or new.last_run_at is distinct from old.last_run_at
       or new.last_status is distinct from old.last_status or new.job_count is distinct from old.job_count) then
    raise exception 'not allowed to change protected feed fields' using errcode = '42501';
  end if;
  if new.publish_public is distinct from old.publish_public and not public.is_platform_admin()
     and not public.is_trusted_backend() then
    raise exception 'only Vouch admins can publish a feed on the public board' using errcode = '42501';
  end if;
  return new;
end $$;

-- Feeds connected by an admin publish publicly by default.
create or replace function public.add_job_feed(p_workspace_id uuid, p_provider text, p_board text, p_company_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_cap integer; v_n integer; v_id uuid;
begin
  if not public.is_company_member(p_workspace_id) then raise exception 'not a workspace member' using errcode = '42501'; end if;
  select source_cap into v_cap from public.companies where id = p_workspace_id;
  select count(*) into v_n from public.job_feeds where workspace_id = p_workspace_id;
  if v_n >= v_cap then
    raise exception 'your plan allows % connected job sources', v_cap using errcode = '54000';
  end if;
  insert into public.job_feeds(workspace_id, provider, board, company_name, created_by, publish_public)
  values (p_workspace_id, p_provider, btrim(p_board), btrim(p_company_name), auth.uid(), public.is_platform_admin())
  returning id into v_id;
  perform public.write_audit('feed.added', 'job_feeds', v_id,
    jsonb_build_object('workspace_id', p_workspace_id, 'provider', p_provider, 'board', p_board));
  return v_id;
end $$;

-- Existing feeds added by admins: publish them and their jobs.
update public.job_feeds f set publish_public = true
where exists (select 1 from public.users u where u.id = f.created_by and u.role = 'admin');
update public.jobs j set visibility = 'public', public_requested_at = null
from public.job_feeds f where j.feed_id = f.id and f.publish_public and j.visibility = 'workspace';
