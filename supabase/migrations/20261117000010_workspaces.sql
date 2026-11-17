-- A1 (addendum section 7): workspaces.
-- A company is the workspace (D-026): company_members are its members, and
-- existing jobs, seats, invitations and RLS keep working. A workspace is either
-- a named company or a personal workspace (a recruiter hiring without a
-- company). Plan limits live here so pricing is easy later (G1).
-- Talent pools are private by default; a workspace admin may opt in to share
-- ANONYMOUS cards with the Vouch network (full details only after the person
-- consents to an introduction, C1).

alter table public.companies
  add column kind text not null default 'company' check (kind in ('company', 'personal')),
  add column plan text not null default 'free' check (plan in ('free', 'pro', 'agency')),
  add column pool_cap integer not null default 500 check (pool_cap >= 0),
  add column batch_file_cap integer not null default 200 check (batch_file_cap between 1 and 1000),
  add column daily_send_cap integer not null default 50 check (daily_send_cap >= 0),
  add column source_cap integer not null default 3 check (source_cap >= 0),
  add column share_pool_anonymously boolean not null default false;

comment on column public.companies.kind is 'company: name shown on jobs; personal: jobs show "Hiring directly"';
comment on column public.companies.share_pool_anonymously is
  'Opt-in: other workspaces see anonymous cards (no name, contacts or file) of this pool';

-- Plan fields are set by platform admins only (billing comes later).
create or replace function public.guard_companies_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.plan, new.pool_cap, new.batch_file_cap, new.daily_send_cap, new.source_cap, new.status)
     is distinct from (old.plan, old.pool_cap, old.batch_file_cap, old.daily_send_cap, old.source_cap, old.status)
     and not public.is_platform_admin() and auth.uid() is not null then
    raise exception 'plan and limits can only be changed by Vouch' using errcode = '42501';
  end if;
  if new.share_pool_anonymously is distinct from old.share_pool_anonymously then
    perform public.write_audit('workspace.pool_sharing', 'companies', new.id,
      jsonb_build_object('share_pool_anonymously', new.share_pool_anonymously));
  end if;
  return new;
end $$;
drop trigger if exists companies_guard_plan on public.companies;
create trigger companies_guard_plan before update on public.companies
  for each row execute function public.guard_companies_plan();

-- Create a workspace (company or personal). create_company() stays for old callers.
create or replace function public.create_workspace(
  p_kind text, p_name text, p_website text default null, p_description text default null,
  p_size text default null, p_location text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_kind not in ('company', 'personal') then raise exception 'invalid workspace kind' using errcode = '22023'; end if;
  if not exists (select 1 from public.users where id = auth.uid() and role = 'recruiter' and status = 'active') then
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
revoke execute on function public.create_workspace(text, text, text, text, text, text) from public, anon;
grant execute on function public.create_workspace(text, text, text, text, text, text) to authenticated;

-- Talent pool ranking: own uploads in full; other workspaces' uploads only if
-- that workspace opted in to anonymous sharing, and then without identity.
create or replace function public.talent_pool_for_job(p_job_id uuid, p_limit integer default 50)
returns table (
  candidate_id uuid, is_own boolean, similarity double precision,
  full_name text, contact_email text, contact_phone text,
  headline text, location text, experience_years double precision, skills text[], uploaded_at timestamptz
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_company uuid := public.job_company_id(p_job_id); v_emb extensions.vector;
begin
  if v_company is null or not public.is_company_member(v_company) then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  select embedding into v_emb from public.jobs where id = p_job_id;
  if v_emb is null then return; end if;
  return query
  select c.id,
         (c.uploaded_by_company_id = v_company),
         (1 - (c.embedding <=> v_emb))::double precision,
         case when c.uploaded_by_company_id = v_company then c.full_name end,
         case when c.uploaded_by_company_id = v_company then c.contact_email end,
         case when c.uploaded_by_company_id = v_company then c.contact_phone end,
         c.headline, c.location, c.experience_years::double precision,
         coalesce((select array_agg(s.skill order by s.skill) from public.candidate_skills s where s.candidate_id = c.id), '{}'),
         c.created_at
  from public.candidates c
  join public.companies co on co.id = c.uploaded_by_company_id and co.status = 'active'
  where c.claim_status = 'unclaimed' and c.embedding is not null
    and (c.uploaded_by_company_id = v_company or co.share_pool_anonymously)
  order by c.embedding <=> v_emb
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- Personal workspaces are not public companies: hide them from anonymous reads
-- (their jobs show "Hiring directly").
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to anon, authenticated
  using ((status = 'active' and kind = 'company') or public.is_company_member(id) or public.is_platform_admin());
