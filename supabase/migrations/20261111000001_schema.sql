-- M1: Core schema (Section 6 of docs/requirements.md)
-- Every table: id uuid, created_at, updated_at, RLS enabled (see 0003_rls).

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('candidate', 'recruiter', 'admin');
create type public.user_status as enum ('active', 'suspended');
create type public.claim_status as enum ('claimed', 'unclaimed');
create type public.work_mode as enum ('remote', 'hybrid', 'onsite');
create type public.skill_source as enum ('self', 'parsed', 'verified');
create type public.parse_status as enum ('pending', 'processing', 'succeeded', 'failed', 'manual');
create type public.company_status as enum ('active', 'suspended');
create type public.company_member_role as enum ('admin', 'recruiter');
create type public.job_source_type as enum ('verified', 'sourced');
-- 'removed' is used for takedowns (see docs/decisions.md D-008)
create type public.job_status as enum ('draft', 'published', 'paused', 'closed', 'expired', 'removed');
create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'internship', 'temporary', 'freelance');
create type public.apply_method as enum ('platform', 'email', 'phone', 'link');
create type public.match_status as enum ('suggested', 'notified', 'approved', 'applied', 'declined', 'expired', 'viewed');
create type public.application_stage as enum ('new', 'reviewed', 'interview', 'offer', 'hired', 'rejected', 'redirected');
create type public.feedback_outcome as enum ('not_a_fit', 'good_fit_different_role');
create type public.redistribution_status as enum ('pending', 'opted_in', 'declined', 'withdrawn');
create type public.notification_channel as enum ('email', 'in_app');
create type public.delivery_status as enum ('pending', 'sent', 'delivered', 'bounced', 'failed', 'skipped');
create type public.takedown_status as enum ('open', 'resolved', 'rejected');
create type public.email_frequency as enum ('instant', 'daily', 'weekly');

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'candidate',
  email text not null,
  status public.user_status not null default 'active',
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  -- nullable so Phase 2 bulk import can create unclaimed profiles
  user_id uuid unique references public.users(id) on delete cascade,
  claim_status public.claim_status not null default 'claimed',
  full_name text,
  headline text,
  summary text,
  location text,
  contact_email text,       -- from resume/profile; NEVER used as a mailing address
  contact_phone text,
  languages text[] not null default '{}',
  desired_roles text[] not null default '{}',
  industries text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  work_mode_pref public.work_mode[] not null default '{}',
  salary_min integer check (salary_min is null or salary_min >= 0),
  salary_max integer check (salary_max is null or salary_max >= 0),
  salary_currency text check (salary_currency is null or salary_currency ~ '^[A-Z]{3}$'),
  availability text,
  open_to_work boolean not null default true,
  visibility_paused boolean not null default false,
  experience_years numeric(4,1) not null default 0,
  match_emails_enabled boolean not null default true,
  match_email_frequency public.email_frequency not null default 'instant',
  -- profile embedding used by the matching engine (built from sanitized profile text)
  embedding extensions.vector(1024),
  embedding_hash text,
  needs_matching boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidates_salary_range check (salary_min is null or salary_max is null or salary_min <= salary_max),
  constraint candidates_claimed_has_user check (claim_status = 'unclaimed' or user_id is not null)
);

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  parsed_json jsonb,
  parse_status public.parse_status not null default 'pending',
  parse_error text,
  embedding extensions.vector(1024),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resumes_candidate_idx on public.resumes(candidate_id);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  website text,
  description text,
  size text,
  location text,
  status public.company_status not null default 'active',
  show_name_on_vetted_badge boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.company_member_role not null default 'recruiter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index company_members_user_idx on public.company_members(user_id);

create table public.candidate_skills (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  skill text not null check (length(skill) between 1 and 100),
  skill_normalized text generated always as (lower(btrim(skill))) stored,
  source public.skill_source not null default 'self',
  weight numeric(4,2) not null default 1.0,
  domain text,               -- for verified skills: the recommended domain
  feedback_id uuid,          -- for verified skills: originating feedback (FK added later)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index candidate_skills_unique on public.candidate_skills(candidate_id, skill_normalized, source, coalesce(feedback_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  title text not null,
  company text,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index experiences_candidate_idx on public.experiences(candidate_id);

create table public.education (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  institution text not null,
  degree text,
  field text,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index education_candidate_idx on public.education(candidate_id);

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  name text not null,
  issuer text,
  issued_date date,
  expires_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index certifications_candidate_idx on public.certifications(candidate_id);

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  source_type public.job_source_type not null default 'verified',
  source_name text,
  source_url text,
  source_company_name text,   -- employer name for sourced jobs (they are not our customer)
  title text not null check (length(title) between 2 and 200),
  description_summary text not null default '',
  required_skills text[] not null default '{}',
  nice_skills text[] not null default '{}',
  required_certifications text[] not null default '{}',
  domains text[] not null default '{}',
  min_exp numeric(4,1) check (min_exp is null or min_exp >= 0),
  max_exp numeric(4,1) check (max_exp is null or max_exp >= 0),
  location text,
  work_mode public.work_mode not null default 'onsite',
  employment_type public.employment_type not null default 'full_time',
  salary_min integer check (salary_min is null or salary_min >= 0),
  salary_max integer check (salary_max is null or salary_max >= 0),
  salary_currency text check (salary_currency is null or salary_currency ~ '^[A-Z]{3}$'),
  apply_method public.apply_method not null default 'platform',
  apply_target text,
  status public.job_status not null default 'draft',
  expires_at timestamptz,
  published_at timestamptz,
  embedding extensions.vector(1024),
  embedding_hash text,
  needs_matching boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_exp_range check (min_exp is null or max_exp is null or min_exp <= max_exp),
  constraint jobs_salary_range check (salary_min is null or salary_max is null or salary_min <= salary_max),
  -- Verified jobs belong to a company and are applied to on-platform.
  constraint jobs_verified_shape check (
    source_type <> 'verified' or (company_id is not null and apply_method = 'platform')
  ),
  -- Sourced jobs must carry provenance and an off-platform way to apply. Never auto-applied.
  constraint jobs_sourced_shape check (
    source_type <> 'sourced' or (
      company_id is null
      and source_name is not null and length(source_name) > 0
      and source_url is not null and source_url ~* '^https?://'
      and apply_method in ('email', 'phone', 'link')
      and apply_target is not null and length(apply_target) > 0
    )
  )
);
create index jobs_company_idx on public.jobs(company_id);
create index jobs_status_idx on public.jobs(status);
create index jobs_title_trgm on public.jobs using gin (lower(title) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Consent, matches, applications
-- ---------------------------------------------------------------------------
create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.candidates(id) on delete cascade,
  type text not null check (type in (
    'match_approval', 'match_decline',
    'redistribution_opt_in', 'redistribution_decline', 'redistribution_withdraw',
    'match_emails_unsubscribe', 'match_emails_resubscribe'
  )),
  subject_type text not null check (subject_type in ('match', 'job', 'redistribution', 'candidate')),
  subject_id uuid not null,
  granted boolean not null,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consent_events_candidate_idx on public.consent_events(candidate_id);
create index consent_events_subject_idx on public.consent_events(subject_id);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  score numeric(5,2) not null check (score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  explanation text not null default '',
  is_vetted boolean not null default false,
  status public.match_status not null default 'suggested',
  notified_at timestamptz,
  responded_at timestamptz,
  viewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);
create index matches_candidate_idx on public.matches(candidate_id);
create index matches_status_idx on public.matches(status);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  match_id uuid unique references public.matches(id) on delete set null,
  job_id uuid not null references public.jobs(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  stage public.application_stage not null default 'new',
  applied_at timestamptz not null default now(),
  consent_event_id uuid not null references public.consent_events(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);
create index applications_job_idx on public.applications(job_id);

create table public.application_stage_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  from_stage public.application_stage,
  to_stage public.application_stage not null,
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stage_history_app_idx on public.application_stage_history(application_id);

-- INTERNAL to the reviewing company (and platform admins via a logged function).
create table public.interview_feedback (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  recruiter_id uuid references public.users(id) on delete set null,
  outcome public.feedback_outcome not null,
  strengths text[] not null default '{}',
  growth_areas text[] not null default '{}',      -- internal only
  suggested_domains text[] not null default '{}',
  rating smallint check (rating is null or rating between 1 and 5),
  private_note text,                               -- internal only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidate_skills
  add constraint candidate_skills_feedback_fk foreign key (feedback_id) references public.interview_feedback(id) on delete cascade;

-- Candidate-facing projection of good_fit_different_role feedback: only
-- strengths + domain + a display label. Never growth areas or notes.
create table public.redistribution_consent (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  feedback_id uuid not null references public.interview_feedback(id) on delete cascade,
  domain text not null,
  strengths text[] not null default '{}',
  source_label text not null default 'a previous employer''s recruiter',
  status public.redistribution_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feedback_id, domain)
);
create index redistribution_candidate_idx on public.redistribution_consent(candidate_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  channel public.notification_channel not null,
  sent_at timestamptz,
  read_at timestamptz,
  delivery_status public.delivery_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_provider_idx on public.notifications(provider_message_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid,
  actor_role text,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log(entity, entity_id);
create index audit_log_created_idx on public.audit_log(created_at desc);

create table public.blocked_companies (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, company_id)
);

create table public.takedown_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  job_reference text,   -- URL/title when the requester doesn't have our job id
  requester_contact text not null check (length(requester_contact) between 3 and 320),
  reason text not null check (length(reason) between 1 and 5000),
  status public.takedown_status not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Server-side rate limiting (fixed window). Service role only.
create table public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  window_start timestamptz not null default now(),
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS on every table (policies in the RLS migration).
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
