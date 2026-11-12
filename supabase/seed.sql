-- Realistic sample data for local development and tests.
-- All people, companies and emails are fictional (example.test domain).
-- Embeddings are NOT seeded: run `npm run matching:run` (the engine embeds on demand).
-- Local password for every seeded account: Password123!

-- ---------------------------------------------------------------------------
-- Auth users (the on_auth_user_created trigger creates public.users/candidates)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'admin@example.test',   '{"role":"recruiter","full_name":"Platform Admin"}'),
  ('00000000-0000-4000-8000-000000000101', 'rita@acme.example.test',   '{"role":"recruiter","full_name":"Rita Recruiter"}'),
  ('00000000-0000-4000-8000-000000000102', 'gary@globex.example.test', '{"role":"recruiter","full_name":"Gary Globex"}'),
  ('00000000-0000-4000-8000-000000000103', 'ivy@initech.example.test', '{"role":"recruiter","full_name":"Ivy Initech"}'),
  ('00000000-0000-4000-8000-000000000201', 'maya@example.test',   '{"role":"candidate","full_name":"Maya Chen"}'),
  ('00000000-0000-4000-8000-000000000202', 'jordan@example.test', '{"role":"candidate","full_name":"Jordan Alvarez"}'),
  ('00000000-0000-4000-8000-000000000203', 'priya@example.test',  '{"role":"candidate","full_name":"Priya Nair"}'),
  ('00000000-0000-4000-8000-000000000204', 'sam@example.test',    '{"role":"candidate","full_name":"Sam Okafor"}'),
  ('00000000-0000-4000-8000-000000000205', 'lena@example.test',   '{"role":"candidate","full_name":"Lena Fischer"}'),
  ('00000000-0000-4000-8000-000000000206', 'diego@example.test',  '{"role":"candidate","full_name":"Diego Santos"}'),
  ('00000000-0000-4000-8000-000000000207', 'aisha@example.test',  '{"role":"candidate","full_name":"Aisha Rahman"}'),
  ('00000000-0000-4000-8000-000000000208', 'tom@example.test',    '{"role":"candidate","full_name":"Tom Becker"}'),
  ('00000000-0000-4000-8000-000000000209', 'grace@example.test',  '{"role":"candidate","full_name":"Grace Kim"}'),
  ('00000000-0000-4000-8000-000000000210', 'noah@example.test',   '{"role":"candidate","full_name":"Noah Williams"}'),
  ('00000000-0000-4000-8000-000000000211', 'elena@example.test',  '{"role":"candidate","full_name":"Elena Rossi"}'),
  ('00000000-0000-4000-8000-000000000212', 'chris@example.test',  '{"role":"candidate","full_name":"Chris Patel"}');

-- On a real Supabase local stack, make the accounts loginable.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
    execute $q$
      update auth.users set
        encrypted_password = extensions.crypt('Password123!', extensions.gen_salt('bf')),
        email_confirmed_at = now(), aud = 'authenticated', role = 'authenticated',
        instance_id = '00000000-0000-0000-0000-000000000000',
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'
      where email like '%example.test'
    $q$;
  end if;
end $$;

update public.users set role = 'admin' where id = '00000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------
insert into public.companies (id, name, website, description, size, location, created_by) values
  ('00000000-0000-4000-8000-00000000c001', 'Acme Social', 'https://acme.example.test', 'A social-first creative agency for consumer brands.', '11-50', 'London, UK', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-00000000c002', 'Globex Financial', 'https://globex.example.test', 'Mid-sized financial services group.', '201-500', 'Frankfurt, Germany', '00000000-0000-4000-8000-000000000102'),
  ('00000000-0000-4000-8000-00000000c003', 'Initech', 'https://initech.example.test', 'B2B software for logistics teams.', '51-200', 'Berlin, Germany', '00000000-0000-4000-8000-000000000103');

insert into public.company_members (company_id, user_id, role) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000101', 'admin'),
  ('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-000000000102', 'admin'),
  ('00000000-0000-4000-8000-00000000c003', '00000000-0000-4000-8000-000000000103', 'admin');

-- ---------------------------------------------------------------------------
-- Candidate profiles
-- ---------------------------------------------------------------------------
create temporary table seed_profiles (
  uid uuid, headline text, summary text, location text, modes public.work_mode[], years numeric,
  roles text[], skills text[], open boolean default true, paused boolean default false
) on commit drop;

insert into seed_profiles values
  ('00000000-0000-4000-8000-000000000201', 'Social Media Marketing Manager',
   'Social media marketing manager with 6 years running paid and organic campaigns on Instagram, TikTok and Facebook for consumer brands. Built content calendars, managed Meta Ads budgets and grew engagement through community management and analytics.',
   'London, UK', '{remote,hybrid}', 6, '{Social Media Manager,Marketing Manager}',
   '{social media marketing,meta ads,content strategy,copywriting,tiktok,instagram,community management,social media analytics}', true, false),
  ('00000000-0000-4000-8000-000000000202', 'Digital Marketing Specialist',
   'Digital marketing specialist with 3 years in performance marketing: social media campaigns, Google Ads, SEO and email marketing for e-commerce.',
   'Manchester, UK', '{remote}', 3.5, '{Digital Marketer}',
   '{social media marketing,google ads,seo,email marketing,meta ads,analytics}', true, false),
  ('00000000-0000-4000-8000-000000000203', 'Content Marketer & Copywriter',
   'Content marketer and copywriter, 4 years writing brand storytelling, blog content and social media copy. Owns content strategy for a lifestyle brand.',
   'Lisbon, Portugal', '{remote}', 4, '{Content Marketer,Copywriter}',
   '{copywriting,content strategy,social media,brand storytelling,blogging,seo}', true, false),
  ('00000000-0000-4000-8000-000000000204', 'Senior Backend Engineer',
   'Backend engineer with 7 years building APIs in TypeScript and Node.js on PostgreSQL and AWS. Led migration to event-driven architecture.',
   'Berlin, Germany', '{remote,hybrid}', 7, '{Backend Engineer}',
   '{typescript,node.js,postgresql,aws,docker,rest apis,kafka}', true, false),
  ('00000000-0000-4000-8000-000000000205', 'Chartered Accountant',
   'Accountant with 8 years in financial reporting under IFRS, month-end close, audit preparation and Excel modelling.',
   'Frankfurt, Germany', '{onsite,hybrid}', 8, '{Financial Accountant}',
   '{ifrs,financial reporting,month-end close,excel,audit,sap}', true, false),
  ('00000000-0000-4000-8000-000000000206', 'Registered Nurse',
   'Registered nurse with 5 years in emergency and critical care. Triage, patient assessment and medication administration.',
   'Madrid, Spain', '{onsite}', 5, '{Nurse}',
   '{patient care,triage,emergency care,medication administration}', true, false),
  ('00000000-0000-4000-8000-000000000207', 'UX Designer',
   'Product designer with 5 years in user research, wireframing and prototyping in Figma for mobile apps.',
   'Amsterdam, Netherlands', '{remote,hybrid}', 5, '{UX Designer}',
   '{figma,user research,prototyping,wireframing,design systems}', true, false),
  ('00000000-0000-4000-8000-000000000208', 'Data Analyst',
   'Data analyst with 4 years of SQL, Python and Tableau dashboards for marketing and sales teams.',
   'London, UK', '{remote,hybrid}', 4, '{Data Analyst}',
   '{sql,python,tableau,excel,statistics}', true, false),
  ('00000000-0000-4000-8000-000000000209', 'Social Media Coordinator',
   'Social media coordinator with 1 year scheduling posts on Instagram and TikTok and reporting engagement.',
   'London, UK', '{remote}', 1, '{Social Media Coordinator}',
   '{social media marketing,instagram,tiktok,canva}', true, false),
  ('00000000-0000-4000-8000-000000000210', 'Social Media Lead (paused)',
   'Social media marketing lead with 8 years, Meta Ads and content strategy.',
   'London, UK', '{remote}', 8, '{Social Media Manager}',
   '{social media marketing,meta ads,content strategy,copywriting}', true, true),
  ('00000000-0000-4000-8000-000000000211', 'Marketing Manager (not looking)',
   'Marketing manager with 7 years in social media marketing and Meta Ads.',
   'London, UK', '{remote}', 7, '{Marketing Manager}',
   '{social media marketing,meta ads,content strategy}', false, false),
  ('00000000-0000-4000-8000-000000000212', 'Sales Representative',
   'B2B sales representative, 4 years prospecting, CRM pipeline management and closing deals. Active on professional social networks.',
   'London, UK', '{remote,onsite}', 4, '{Account Executive}',
   '{sales,crm,negotiation,lead generation}', true, false);

update public.candidates c set
  headline = p.headline, summary = p.summary, location = p.location, work_mode_pref = p.modes,
  experience_years = p.years, desired_roles = p.roles, open_to_work = p.open, visibility_paused = p.paused,
  contact_email = u.email, availability = 'Within 1 month', salary_currency = 'EUR'
from seed_profiles p join public.users u on u.id = p.uid
where c.user_id = p.uid;

insert into public.candidate_skills (candidate_id, skill, source)
select c.id, s, 'parsed' from seed_profiles p join public.candidates c on c.user_id = p.uid, unnest(p.skills) s;

insert into public.experiences (candidate_id, title, company, start_date, end_date, is_current, description, position)
select c.id, p.headline, 'Previous Employer', (current_date - (p.years * 365)::int), null, true, p.summary, 0
from seed_profiles p join public.candidates c on c.user_id = p.uid;

insert into public.certifications (candidate_id, name, issuer)
select c.id, 'Meta Certified Digital Marketing Associate', 'Meta'
from public.candidates c where c.user_id in ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202');
insert into public.certifications (candidate_id, name, issuer)
select c.id, 'Certified Public Accountant (CPA)', 'AICPA' from public.candidates c where c.user_id = '00000000-0000-4000-8000-000000000205';

-- An unclaimed profile (as Phase 2 bulk import would create). Never matched or emailed.
insert into public.candidates (id, user_id, claim_status, full_name, headline, summary, location, experience_years, contact_email)
values ('00000000-0000-4000-8000-00000000a999', null, 'unclaimed', 'Imported Person', 'Social Media Marketing Manager',
        'Social media marketing manager, Meta Ads, content strategy, 9 years.', 'London, UK', 9, 'imported@example.test');
insert into public.candidate_skills (candidate_id, skill, source) values
  ('00000000-0000-4000-8000-00000000a999', 'social media marketing', 'parsed'),
  ('00000000-0000-4000-8000-00000000a999', 'meta ads', 'parsed');

-- Noah blocks Globex (shows block-list behaviour)
insert into public.blocked_companies (candidate_id, company_id)
select id, '00000000-0000-4000-8000-00000000c002' from public.candidates where user_id = '00000000-0000-4000-8000-000000000210';

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
insert into public.jobs (id, company_id, source_type, title, description_summary, required_skills, nice_skills, domains,
  min_exp, max_exp, location, work_mode, employment_type, salary_min, salary_max, salary_currency, status, expires_at, created_by)
values
  ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000c001', 'verified',
   'Social Media Marketing Manager',
   'Own social media marketing for three consumer brands: plan content strategy, run Meta Ads campaigns, manage community and report on analytics.',
   '{social media marketing,meta ads,content strategy}', '{tiktok,copywriting,community management}', '{marketing,social media}',
   3, 10, 'London, UK', 'remote', 'full_time', 55000, 70000, 'GBP', 'published', now() + interval '60 days', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000c003', 'verified',
   'Senior Backend Engineer (TypeScript)',
   'Design and build Node.js/TypeScript services on PostgreSQL and AWS for our logistics platform.',
   '{typescript,node.js,postgresql}', '{aws,kafka,docker}', '{engineering,backend}',
   5, null, 'Berlin, Germany', 'hybrid', 'full_time', 80000, 100000, 'EUR', 'published', now() + interval '60 days', '00000000-0000-4000-8000-000000000103'),
  ('00000000-0000-4000-8000-00000000f003', '00000000-0000-4000-8000-00000000c002', 'verified',
   'Financial Accountant',
   'Prepare IFRS financial statements, run month-end close and support external audit.',
   '{ifrs,financial reporting}', '{sap,excel}', '{finance,accounting}',
   4, null, 'Frankfurt, Germany', 'onsite', 'full_time', 60000, 75000, 'EUR', 'published', now() + interval '60 days', '00000000-0000-4000-8000-000000000102'),
  ('00000000-0000-4000-8000-00000000f004', '00000000-0000-4000-8000-00000000c001', 'verified',
   'Junior Copywriter (draft)', 'Write social media and campaign copy.', '{copywriting}', '{social media}', '{marketing,content}',
   0, 2, 'London, UK', 'hybrid', 'full_time', null, null, null, 'draft', null, '00000000-0000-4000-8000-000000000101');

insert into public.jobs (id, source_type, source_name, source_url, source_company_name, title, description_summary,
  required_skills, nice_skills, domains, min_exp, location, work_mode, employment_type, apply_method, apply_target, status, expires_at)
values
  ('00000000-0000-4000-8000-00000000f101', 'sourced', 'Northwind careers page', 'https://careers.northwind.example.test/jobs/content-writer',
   'Northwind Traders', 'Content Writer',
   'Northwind is hiring a remote content writer to produce blog articles, newsletters and social media copy. Summary written by our team; see the original listing for full details.',
   '{copywriting,content strategy}', '{seo,social media}', '{marketing,content}', 2, null, 'remote', 'contract', 'link',
   'https://careers.northwind.example.test/jobs/content-writer/apply', 'published', now() + interval '30 days');

-- Reset matching flags so the first engine run processes everything.
update public.jobs set needs_matching = (status = 'published');
update public.candidates set needs_matching = true;
