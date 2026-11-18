-- More company career feeds and forward-by-email jobs (D-037).

alter table public.job_feeds drop constraint job_feeds_provider_check;
alter table public.job_feeds add constraint job_feeds_provider_check
  check (provider in ('greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'recruitee'));

-- One private inbox per workspace: a secret URL that an email-forwarding service
-- (Cloudflare Email Routing, Mailgun routes, SendGrid Inbound Parse...) posts
-- forwarded job emails to. Each email becomes a DRAFT job for review.
create table public.job_inboxes (
  workspace_id uuid primary key references public.companies(id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_received_at timestamptz,
  received_count integer not null default 0
);
alter table public.job_inboxes enable row level security;
create policy job_inboxes_member_select on public.job_inboxes for select to authenticated
  using (public.is_company_member(workspace_id));
grant select on public.job_inboxes to authenticated;
grant all on public.job_inboxes to service_role;

-- Create or reset the inbox (old URL stops working). Workspace admins only.
create or replace function public.reset_job_inbox(p_workspace_id uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := translate(encode(extensions.gen_random_bytes(30), 'base64'), '+/=', '-_');
begin
  if not public.is_company_admin(p_workspace_id) then raise exception 'only workspace admins can do this' using errcode = '42501'; end if;
  insert into public.job_inboxes(workspace_id, token, created_by) values (p_workspace_id, v_token, auth.uid())
  on conflict (workspace_id) do update set token = excluded.token, created_by = excluded.created_by, created_at = now();
  perform public.write_audit('inbox.reset', 'companies', p_workspace_id, '{}'::jsonb);
  return v_token;
end $$;
revoke execute on function public.reset_job_inbox(uuid) from public, anon;
grant execute on function public.reset_job_inbox(uuid) to authenticated;
