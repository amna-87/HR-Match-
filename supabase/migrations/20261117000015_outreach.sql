-- C2 (addendum section 5): recruiter-initiated outreach with safeguards. See D-031.
-- Launch scope (7d): "Copy message" and "Export contact + job". Direct email
-- sending is built behind a server flag and uses the same checks.
--   * do_not_contact and the GLOBAL suppression list are enforced here, in the
--     database, for every channel (not only in the UI);
--   * every message carries a one-click opt-out that suppresses the address
--     for all of Vouch; we store only a hash of the address;
--   * lawful-basis confirmation is required and audited;
--   * per-workspace daily cap (companies.daily_send_cap) and, for email, a
--     per-address cap (1 per 7 days across Vouch);
--   * a workspace with a high complaint rate is paused automatically.

create or replace function public.contact_hash(p_contact text) returns text
language sql immutable set search_path = public, extensions as $$
  select case
    when p_contact is null or btrim(p_contact) = '' then null
    when p_contact like '%@%' then encode(extensions.digest('vouch-contact:' || lower(btrim(p_contact)), 'sha256'), 'hex')
    when length(regexp_replace(p_contact, '\D', '', 'g')) >= 7
      then encode(extensions.digest('vouch-contact:' || right(regexp_replace(p_contact, '\D', '', 'g'), 10), 'sha256'), 'hex')
  end
$$;

create table public.suppression_list (
  contact_hash text primary key,
  reason text not null default 'opt_out' check (reason in ('opt_out', 'complaint', 'bounce', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.suppression_list enable row level security;
-- no policies: only definer functions and the trusted backend touch it
grant all on public.suppression_list to service_role;

create table public.outreach_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  pool_candidate_id uuid references public.pool_candidates(id) on delete set null,
  channel text not null check (channel in ('copy', 'export', 'email')),
  contact_hash text,
  provider_message_id text,
  complained_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index outreach_log_ws_day_idx on public.outreach_log(workspace_id, created_at desc);
create index outreach_log_contact_idx on public.outreach_log(contact_hash, created_at desc) where channel = 'email';
create index outreach_log_msg_idx on public.outreach_log(provider_message_id) where provider_message_id is not null;
alter table public.outreach_log enable row level security;
create policy outreach_log_member_select on public.outreach_log for select to authenticated
  using (public.is_company_member(workspace_id));
grant select on public.outreach_log to authenticated;
grant all on public.outreach_log to service_role;

alter table public.companies add column outreach_paused_at timestamptz;

-- Prepare outreach for selected pool profiles of the caller's workspace for one
-- of its jobs. Returns every selected profile with either its contact details
-- (allowed) or the reason it is blocked. Allowed rows are logged, counted
-- against the daily cap and move from 'new' to 'contacted'.
create or replace function public.prepare_outreach(
  p_job_id uuid, p_pool_ids uuid[], p_channel text, p_lawful_basis boolean
) returns table (pool_candidate_id uuid, full_name text, contact_email text, contact_phone text, blocked text)
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := public.job_workspace_id(p_job_id);
  v_cap integer; v_paused timestamptz; v_used integer; v_allowed integer := 0; r record; v_hash text; v_block text;
begin
  if v_ws is null or not public.is_company_member(v_ws) then raise exception 'job not found' using errcode = 'P0002'; end if;
  if p_channel not in ('copy', 'export', 'email') then raise exception 'invalid channel' using errcode = '22023'; end if;
  if not coalesce(p_lawful_basis, false) then
    raise exception 'confirm you have a lawful basis to contact these people' using errcode = '22023';
  end if;
  if cardinality(p_pool_ids) > 200 then raise exception 'select at most 200 people at a time' using errcode = '54000'; end if;
  select daily_send_cap, outreach_paused_at into v_cap, v_paused from public.companies where id = v_ws;
  if v_paused is not null and p_channel = 'email' then
    raise exception 'email outreach is paused for this workspace (too many complaints); contact Vouch' using errcode = '42501';
  end if;
  select count(*) into v_used from public.outreach_log where workspace_id = v_ws and created_at > now() - interval '1 day';

  for r in
    select p.* from public.pool_candidates p
    where p.id = any(p_pool_ids) and p.workspace_id = v_ws
    order by array_position(p_pool_ids, p.id)
  loop
    v_hash := coalesce(public.contact_hash(r.contact_email), public.contact_hash(r.contact_phone));
    v_block := case
      when r.do_not_contact then 'marked do not contact'
      when v_hash is null then 'no contact details'
      when exists (select 1 from public.suppression_list s
                   where s.contact_hash in (public.contact_hash(r.contact_email), public.contact_hash(r.contact_phone)))
        then 'unsubscribed from Vouch messages'
      when p_channel = 'email' and r.contact_email is null then 'no email address'
      when p_channel = 'email' and exists (select 1 from public.outreach_log l where l.channel = 'email'
             and l.contact_hash = public.contact_hash(r.contact_email) and l.created_at > now() - interval '7 days')
        then 'already emailed through Vouch in the last 7 days'
      when v_used + v_allowed >= v_cap then 'daily limit reached'
    end;
    if v_block is null then
      v_allowed := v_allowed + 1;
      insert into public.outreach_log(workspace_id, job_id, pool_candidate_id, channel, contact_hash, created_by)
      values (v_ws, p_job_id, r.id, p_channel,
              case when p_channel = 'email' then public.contact_hash(r.contact_email) else v_hash end, auth.uid());
      update public.pool_candidates set status = 'contacted' where id = r.id and status = 'new';
      return query select r.id, r.full_name, r.contact_email, r.contact_phone, null::text;
    else
      return query select r.id, r.full_name, null::text, null::text, v_block;
    end if;
  end loop;
  perform public.write_audit('outreach.prepared', 'jobs', p_job_id, jsonb_build_object(
    'workspace_id', v_ws, 'channel', p_channel, 'selected', cardinality(p_pool_ids), 'allowed', v_allowed,
    'lawful_basis_confirmed', true));
end $$;
revoke execute on function public.prepare_outreach(uuid, uuid[], text, boolean) from public, anon;
grant execute on function public.prepare_outreach(uuid, uuid[], text, boolean) to authenticated;

-- One-click opt-out (from the link in every message). Called by the server after
-- verifying the signed link; also usable by the trusted backend for complaints.
create or replace function public.suppress_contact(p_hash text, p_reason text default 'opt_out') returns void
language sql security definer set search_path = public as $$
  insert into public.suppression_list(contact_hash, reason) values (p_hash, coalesce(p_reason, 'opt_out'))
  on conflict (contact_hash) do nothing
$$;
revoke execute on function public.suppress_contact(text, text) from public, anon, authenticated;

-- Complaint handling for outreach email: suppress the address and pause the
-- workspace when complaints exceed 0.3% of its last 30 days of email (min. 3).
create or replace function public.record_outreach_complaint(p_message_id text) returns void
language plpgsql security definer set search_path = public as $$
declare l public.outreach_log; v_sent integer; v_complaints integer;
begin
  update public.outreach_log set complained_at = now() where provider_message_id = p_message_id and complained_at is null
  returning * into l;
  if l.id is null then return; end if;
  if l.contact_hash is not null then perform public.suppress_contact(l.contact_hash, 'complaint'); end if;
  select count(*), count(complained_at) into v_sent, v_complaints from public.outreach_log
  where workspace_id = l.workspace_id and channel = 'email' and created_at > now() - interval '30 days';
  if v_complaints >= 3 and v_complaints::numeric / greatest(v_sent, 1) > 0.003 then
    update public.companies set outreach_paused_at = now() where id = l.workspace_id and outreach_paused_at is null;
    perform public.write_audit('outreach.workspace_paused', 'companies', l.workspace_id,
      jsonb_build_object('sent_30d', v_sent, 'complaints_30d', v_complaints));
  end if;
end $$;
revoke execute on function public.record_outreach_complaint(text) from public, anon, authenticated;

-- The outreach pause is lifted by Vouch only (same guard as plan limits).
create or replace function public.guard_companies_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.plan, new.pool_cap, new.batch_file_cap, new.daily_send_cap, new.source_cap, new.status, new.outreach_paused_at)
     is distinct from (old.plan, old.pool_cap, old.batch_file_cap, old.daily_send_cap, old.source_cap, old.status, old.outreach_paused_at)
     and not public.is_platform_admin() and auth.uid() is not null then
    raise exception 'plan and limits can only be changed by Vouch' using errcode = '42501';
  end if;
  if new.share_pool_anonymously is distinct from old.share_pool_anonymously then
    perform public.write_audit('workspace.pool_sharing', 'companies', new.id,
      jsonb_build_object('share_pool_anonymously', new.share_pool_anonymously));
  end if;
  return new;
end $$;
