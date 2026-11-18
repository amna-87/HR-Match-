-- D-034 (product owner): admins can do everything recruiters can (their own
-- workspace: bulk resumes, bulk jobs, feeds, matching, outreach). Being admin
-- does NOT give access to other workspaces' pools; RLS is unchanged.

create or replace function public.create_workspace(
  p_kind text, p_name text, p_website text default null, p_description text default null,
  p_size text default null, p_location text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_kind not in ('company', 'personal') then raise exception 'invalid workspace kind' using errcode = '22023'; end if;
  if not exists (select 1 from public.users where id = auth.uid() and role in ('recruiter', 'admin') and status = 'active') then
    raise exception 'only recruiters can create workspaces' using errcode = '42501';
  end if;
  if exists (select 1 from public.company_members where user_id = auth.uid()) then
    raise exception 'you already belong to a workspace' using errcode = '23505';
  end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'name is required' using errcode = '22023'; end if;
  insert into public.companies(kind, name, website, description, size, location, created_by)
  values (p_kind, btrim(p_name), p_website, p_description, p_size, p_location, auth.uid()) returning id into v_id;
  insert into public.company_members(company_id, user_id, role) values (v_id, auth.uid(), 'admin');
  perform public.write_audit('company.created', 'companies', v_id, jsonb_build_object('kind', p_kind));
  return v_id;
end $$;

-- Admins can also join a workspace by invitation.
create or replace function public.accept_invitation(p_invitation_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv public.company_invitations; v_user public.users;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null or v_user.status <> 'active' then raise exception 'not signed in' using errcode = '42501'; end if;
  if v_user.role not in ('recruiter', 'admin') then raise exception 'only recruiter accounts can join a company' using errcode = '42501'; end if;
  if public.my_verified_email() is null then raise exception 'verify your email address first' using errcode = '42501'; end if;
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
