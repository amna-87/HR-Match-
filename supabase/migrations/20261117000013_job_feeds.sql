-- B2 (addendum section 4): company career feeds (official ATS job-board APIs)
-- and CSV imports. See docs/decisions.md D-029.

create table public.job_feeds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('greenhouse', 'lever')),
  board text not null check (board ~ '^[A-Za-z0-9._-]{1,100}$'),
  company_name text not null check (length(company_name) between 1 and 200),
  active boolean not null default true,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  job_count integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, board)
);
create trigger set_updated_at before update on public.job_feeds for each row execute function public.set_updated_at();

alter table public.jobs
  add column feed_id uuid references public.job_feeds(id) on delete set null,
  add column external_id text;
create unique index jobs_feed_external_idx on public.jobs(feed_id, external_id) where feed_id is not null;

alter table public.job_feeds enable row level security;
create policy job_feeds_member_select on public.job_feeds for select to authenticated
  using (public.is_company_member(workspace_id) or public.is_platform_admin());
create policy job_feeds_member_update on public.job_feeds for update to authenticated
  using (public.is_company_member(workspace_id)) with check (public.is_company_member(workspace_id));
create policy job_feeds_member_delete on public.job_feeds for delete to authenticated
  using (public.is_company_member(workspace_id));
grant select, update, delete on public.job_feeds to authenticated;
grant all on public.job_feeds to service_role;

-- Members can only toggle `active`; the fetcher (trusted backend) writes run results.
create or replace function public.guard_job_feeds() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_trusted_backend() and (
       new.workspace_id is distinct from old.workspace_id or new.provider is distinct from old.provider
       or new.board is distinct from old.board or new.last_run_at is distinct from old.last_run_at
       or new.last_status is distinct from old.last_status or new.job_count is distinct from old.job_count) then
    raise exception 'not allowed to change protected feed fields' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_job_feeds before update on public.job_feeds for each row execute function public.guard_job_feeds();

-- Add a feed; enforces the plan's connected-source cap (G1 usage limits).
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
  insert into public.job_feeds(workspace_id, provider, board, company_name, created_by)
  values (p_workspace_id, p_provider, btrim(p_board), btrim(p_company_name), auth.uid()) returning id into v_id;
  perform public.write_audit('feed.added', 'job_feeds', v_id,
    jsonb_build_object('workspace_id', p_workspace_id, 'provider', p_provider, 'board', p_board));
  return v_id;
end $$;
revoke execute on function public.add_job_feed(uuid, text, text, text) from public, anon;
grant execute on function public.add_job_feed(uuid, text, text, text) to authenticated;

-- feed jobs can't be re-pointed by API users
create or replace function public.guard_jobs_feed() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_trusted_backend() and (
       (tg_op = 'INSERT' and (new.feed_id is not null or new.external_id is not null))
       or (tg_op = 'UPDATE' and (new.feed_id is distinct from old.feed_id or new.external_id is distinct from old.external_id))) then
    raise exception 'feed jobs are managed by Vouch' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_jobs_feed before insert or update on public.jobs for each row execute function public.guard_jobs_feed();
