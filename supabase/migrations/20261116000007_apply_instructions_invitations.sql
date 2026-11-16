-- 1) "How to apply" for verified jobs (spec 5.3).
-- Applying still always happens through the candidate's approval (consent-first);
-- these are the employer's next-step instructions, shown on the job page and to
-- candidates once they have applied (e.g. "We reply within 5 working days; the
-- first stage is a 30-minute call").
alter table public.jobs
  add column apply_instructions text check (apply_instructions is null or length(apply_instructions) <= 2000);

-- 2) Recruiter seat invitations (spec 4: company admins manage recruiter seats).
-- A company admin invites an email address. The invitee signs up / logs in as a
-- recruiter with that (verified) email and accepts. No token in the URL is needed:
-- acceptance is bound to the signed-in account's email.
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 320),
  role public.company_member_role not null default 'recruiter',
  status public.invitation_status not null default 'pending',
  invited_by uuid references public.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index company_invitations_one_pending on public.company_invitations(company_id, lower(email)) where status = 'pending';
create index company_invitations_email_idx on public.company_invitations(lower(email));

alter table public.company_invitations enable row level security;
create trigger set_updated_at before update on public.company_invitations
  for each row execute function public.set_updated_at();

-- Company members can see their company's invitations; invitees see their own pending ones.
create policy invitations_company_select on public.company_invitations for select to authenticated
  using (public.is_company_member(company_id));
create policy invitations_invitee_select on public.company_invitations for select to authenticated
  using (status = 'pending' and expires_at > now()
         and lower(email) = (select lower(u.email) from public.users u where u.id = auth.uid()));
-- All writes go through the functions below.
revoke insert, update, delete on public.company_invitations from anon, authenticated;

create or replace function public.invite_recruiter(p_company_id uuid, p_email text, p_role text default 'recruiter') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text := lower(btrim(p_email));
begin
  if not public.is_company_admin(p_company_id) then raise exception 'not a company admin' using errcode = '42501'; end if;
  if p_role not in ('recruiter', 'admin') then raise exception 'invalid role' using errcode = '22023'; end if;
  if exists (select 1 from public.company_members cm join public.users u on u.id = cm.user_id
             where cm.company_id = p_company_id and lower(u.email) = v_email) then
    raise exception 'that person is already a member of this company' using errcode = 'P0001';
  end if;
  -- re-inviting refreshes the pending invitation instead of duplicating it
  update public.company_invitations
     set role = p_role::public.company_member_role, expires_at = now() + interval '14 days', invited_by = auth.uid()
   where company_id = p_company_id and lower(email) = v_email and status = 'pending'
   returning id into v_id;
  if v_id is null then
    insert into public.company_invitations(company_id, email, role, invited_by)
    values (p_company_id, v_email, p_role::public.company_member_role, auth.uid()) returning id into v_id;
  end if;
  perform public.write_audit('company.invitation_sent', 'company_invitations', v_id,
    jsonb_build_object('company_id', p_company_id, 'role', p_role));
  return v_id;
end $$;

create or replace function public.revoke_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  select company_id into v_company from public.company_invitations where id = p_invitation_id and status = 'pending';
  if v_company is null or not public.is_company_admin(v_company) then raise exception 'not found' using errcode = 'P0002'; end if;
  update public.company_invitations set status = 'revoked' where id = p_invitation_id;
  perform public.write_audit('company.invitation_revoked', 'company_invitations', p_invitation_id, '{}'::jsonb);
end $$;

create or replace function public.accept_invitation(p_invitation_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv public.company_invitations; v_user public.users;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null or v_user.status <> 'active' then raise exception 'not signed in' using errcode = '42501'; end if;
  if v_user.role <> 'recruiter' then raise exception 'only recruiter accounts can join a company' using errcode = '42501'; end if;
  select * into v_inv from public.company_invitations where id = p_invitation_id for update;
  if v_inv.id is null or v_inv.status <> 'pending' or lower(v_inv.email) <> lower(v_user.email) then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if v_inv.expires_at <= now() then raise exception 'this invitation has expired' using errcode = 'P0001'; end if;
  insert into public.company_members(company_id, user_id, role) values (v_inv.company_id, v_user.id, v_inv.role)
  on conflict (company_id, user_id) do update set role = excluded.role;
  update public.company_invitations set status = 'accepted', accepted_by = v_user.id, accepted_at = now() where id = v_inv.id;
  perform public.write_audit('company.invitation_accepted', 'company_invitations', v_inv.id,
    jsonb_build_object('company_id', v_inv.company_id));
  return v_inv.company_id;
end $$;

revoke execute on function public.invite_recruiter(uuid, text, text), public.revoke_invitation(uuid),
  public.accept_invitation(uuid) from public, anon;
grant execute on function public.invite_recruiter(uuid, text, text), public.revoke_invitation(uuid),
  public.accept_invitation(uuid) to authenticated;

-- Invitations hold the invitee's email address; erase them when that person deletes their account.
create or replace function public.erase_invitations_for_email(p_email text) returns void
language sql security definer set search_path = public as $$
  delete from public.company_invitations where lower(email) = lower(p_email)
$$;
revoke execute on function public.erase_invitations_for_email(text) from public, anon, authenticated;

-- Company members can see each other's email addresses (users RLS only exposes your own row).
create or replace function public.company_member_list(p_company_id uuid)
returns table (id uuid, role public.company_member_role, user_id uuid, email text)
language sql stable security definer set search_path = public as $$
  select cm.id, cm.role, cm.user_id, u.email
  from public.company_members cm join public.users u on u.id = cm.user_id
  where cm.company_id = p_company_id and public.is_company_member(p_company_id)
  order by cm.created_at
$$;
revoke execute on function public.company_member_list(uuid) from public, anon;
grant execute on function public.company_member_list(uuid) to authenticated;
