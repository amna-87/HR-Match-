# Design decisions

Log of decisions made during the build. Newest at the bottom. "Open item" references point to Section 17 of
`requirements.md`.

## D-001 Consent rules are enforced in the database, not only in app code

`applications` has no INSERT policy for API roles, and a trigger (`guard_applications_insert`) refuses any application
that lacks a granted `match_approval` consent event from the same candidate for that match/job — even for the service
role. Matches can only move along the Section 8 state machine (`guard_matches`, `match_transition_allowed`).
`respond_to_match()` is the only path that creates applications. A TypeScript mirror of the state machine
(`src/lib/consent/state-machine.ts`) exists for UI logic and is tested to agree.

## D-002 Trusted backend uses a direct Postgres connection

Matching, notifier, cron, erasure and email-link handling use `pg` with `DATABASE_URL` (Supabase pooled connection),
which bypasses RLS. All user-initiated reads/writes use the per-request Supabase client so RLS applies. Reason: one data
access path for trusted code that is testable against plain Postgres; security-definer SQL functions re-check
authorization themselves. On Vercel, use the Supavisor transaction-mode pooler URL.

## D-003 Embeddings provider (open item: "Embeddings provider choice")

Schema uses `vector(1024)`. Production: **Voyage AI `voyage-3.5`** at 1024 dims (`EMBEDDINGS_PROVIDER=voyage`). Dev/tests:
a deterministic local feature-hashing embedder (`EMBEDDINGS_PROVIDER=local`) so tests are reproducible and offline.
Embeddings are computed from sanitized profile text (`candidateEmbeddingText`), stored on `candidates.embedding` (the
edited profile is the source of truth, not the raw resume). `resumes.embedding` is kept per the spec but unused for now.
Changing provider: re-embed everything (hash includes provider name, so the engine re-embeds automatically).

## D-004 Scoring weights (open item: "Exact scoring weights")

Initial weights in `src/lib/matching/config.ts`: semantic 0.35, skills 0.45 (required 0.8 / nice 0.2), experience 0.20;
verified (interview-vetted) boost up to +8 points only for opted-in domains that the job lists; threshold 70; top-N 50.
Semantic similarity is normalized per provider (local 0.05–0.55, voyage 0.30–0.80). These must be re-tuned on real data;
`tests/matching` holds the fixture rankings that must keep passing.

## D-005 Match email frequency cap (open item)

Default: max **3** match emails per candidate per rolling 7 days, max 5 matches per email (digest). Candidates can also
choose instant / at most daily / at most weekly. Throttled matches stay `suggested` and go out later. Candidates with
match emails off are still notified in-app (status becomes `notified`).

## D-006 Vetted badge company name (open item)

Default hidden: shown as "a previous employer's recruiter". Company admins can opt in per company
(`companies.show_name_on_vetted_badge`).

## D-007 Redistribution visibility model

`interview_feedback` is internal to the reviewing company (no candidate or cross-company access; admins only via
`admin_read_feedback(id, reason)` which logs the reason). A trigger copies only candidate-safe fields (strengths, domain,
display label) into `redistribution_consent`. When a candidate opts in to a domain:

- other recruiters see them via `recruiter_job_matches()` for jobs whose `domains` include that domain, as a reduced
  card (headline, location, years, strengths, badge) — **no name or contact details**, no full profile access;
- their strengths become `candidate_skills` rows with `source = 'verified'` (weight 1.5) — removed on withdrawal.

They still have to approve each job like anyone else before an application exists. Added `jobs.domains` (not in the
spec's field list) to make domain matching explicit; paste-to-structure extracts it.

## D-008 Job status `removed`

Added to the spec's statuses for takedowns/moderation. Recruiters cannot republish a removed job (trigger).

## D-009 Email links: click opens a confirmation page

Approve/decline links open `/m/<token>` with a single confirm button that POSTs. A plain GET never approves anything, so
link scanners/prefetchers can't apply on a candidate's behalf. Tokens are HMAC-signed, purpose-bound (approve, decline,
view, unsubscribe), expire with the match (14 days); answering is idempotent and a second, different answer is refused.
Viewing a sourced listing (no consent implied) is recorded on page load.

## D-010 Unclaimed profiles

Schema supports them (`candidates.user_id` nullable, `claim_status`). They are excluded from matching hard filters,
never visible to recruiters, never notified or emailed. Phase 2 import/claim flow will decide opt-in semantics.

## D-011 Account deletion

`erase_user()` (service role only) deletes applications (and with them the company's feedback rows about that
application), consent events, the candidate profile (cascading resumes, skills, embeddings, matches, redistribution
consents), notifications and memberships; audit entries referencing the user are kept but anonymized (actor/entity ids
replaced, metadata stripped). The server then deletes resume files from storage and the auth user.

## D-012 Rate limiting in Postgres

Fixed-window counters in `rate_limits` via `check_rate_limit()` (works across serverless instances). Limits in
`src/lib/security/rate-limit.ts`. Auth fails closed if the limiter is unavailable; other endpoints fail open.

## D-013 UI components

Hand-written shadcn/ui-style primitives in `src/components/ui` (Button, Input, Card, Badge, Alert...) instead of running
the shadcn generator, to keep the dependency surface small. They follow the same Tailwind token conventions, so
generated shadcn components can be added later without conflicts.

## D-014 Resume parsing

Text is extracted locally (pdf-parse / mammoth, first 20 pages, 20 s timeout, magic-byte validation, nothing executed),
then Claude (`claude-opus-5-5`, structured output, low effort) fills a Zod schema that has **no fields** for protected
characteristics; output is sanitized and protected details are stripped again. Parsed data pre-fills a review form;
nothing is saved to the profile until the candidate saves. If parsing fails or AI isn't configured, the file is kept and
the candidate fills the form manually. Claude calls opt into server-side refusal fallbacks (`fallbacks: "default"`).

## D-015 Recruiter seats (updated by D-017)

Originally: company admins add colleagues who already have a recruiter account. Superseded by email invitations (D-017).

## D-016 "How to apply" on verified jobs

Spec 5.3 lists "how to apply" in the job form. For verified jobs, applying always goes through the candidate's approval
(principle 1), so `apply_method` stays `platform`. The field is `jobs.apply_instructions`: the employer's next steps
(e.g. reply time, interview stages), shown on the job page, after approving from an email, and with the candidate's
applications. Sourced jobs keep `apply_method` / `apply_target` (email, phone or link).

## D-017 Recruiter invitations

`company_invitations` + `invite_recruiter` / `revoke_invitation` / `accept_invitation`. A company admin invites an
email; the invitee signs up or logs in as a recruiter **with that verified email** and accepts on /recruiter. There is
no token in the link: acceptance is bound to the signed-in account's email. Invitations expire after 14 days; re-inviting
refreshes the pending one; all steps are audited. The invitation email is a one-off transactional email to an address
the company admin typed in — not a resume-derived address and not a mailing list. `company_member_list()` lets members
see colleagues' emails (users RLS only exposes your own row).

## D-018 Background schedule on the Vercel Hobby plan

Vercel Hobby crons run at most daily, so `vercel.json` runs `/api/cron/run` daily. For a 10-minute cadence at no cost,
`supabase/ops/schedule-background-jobs.sql` uses Supabase `pg_cron` + `pg_net` to call the same endpoint, with the
`CRON_SECRET` and app URL stored in Supabase Vault. It is an ops script, not a migration, because it holds a secret and
is per-environment.

## D-019 Environments

`APP_ENV` (or Vercel's `VERCEL_ENV=preview`) marks staging: a banner is shown and search engines are told not to index.
Staging = Vercel Preview deployments + a separate Supabase project, with Preview-scoped env vars (see README).

## D-020 Auth rate limits

Login/sign-up/reset are limited per account+IP (10 per 10 min, stops password guessing) and per IP (60 per 10 min,
stops spraying many accounts). A per-IP-only limit would lock out whole offices behind one IP.

## D-021 Accessibility

`tests/e2e/a11y.spec.ts` runs axe-core (WCAG 2.1 A/AA rules) on 22 pages across all roles and fails on serious or
critical violations. Automated checks don't replace a manual screen-reader pass before launch.

## D-022 Recruiter talent pool (product-owner decision, 2026-11-16)

The owner asked for recruiters to upload resumes of job seekers, reachable by other recruiters, with the person
notified about matching jobs once they join. Chosen visibility model (asked and agreed: "uploader + anonymous"):

- Uploads are **unclaimed** candidates with `uploaded_by_company_id`. The uploading company sees and edits the full
  profile and resume file (RLS via `company_owns_upload`; files only through short-lived signed URLs).
- Other companies see uploads only through `talent_pool_for_job()`, ranked against one of their own jobs, as an
  anonymous card: headline, location, years, skills. Name, contact details, summary, employers and file are never
  returned to them. They cannot contact the person.
- Uploaded people are **never emailed** (principle 2) and are excluded from normal matching, matches and applications.
- When someone signs up with the same **verified** email (`auth.users.email_confirmed_at`), their dashboard names the
  company that uploaded it and offers "Add to my profile" (`claim_uploaded_profile`: merges into their own profile —
  their own entries win — removes the upload, the company loses access, matching runs and matches arrive in-app and by
  email per their settings) or "Delete it". Unverified emails can't claim (stops someone signing up with another
  person's address). Account deletion also erases uploads for that email.
- The uploader must confirm they may share the resume (lawful basis checkbox); every upload/claim/delete is audited.
- Without an AI key, a deterministic basic reader (`src/lib/parsing/basic-resume.ts`) extracts contact details,
  skills from a vocabulary and stated years; the recruiter can edit the result.
- `accept_invitation` now also requires a verified email, for the same reason.

Jobs: published jobs were already public (`/jobs`, RLS `jobs_select_published` for `anon`); the home page now lists
the latest six and `/jobs` has search and a work-mode filter.

## D-023 Sourced jobs from private channels (product-owner decision, 2026-11-16)

Jobs collected from a WhatsApp jobs channel often have no public link, only an email or phone number. The owner chose
to allow sourced jobs **without a source link**: `jobs_sourced_shape` now accepts a null `source_url` (still http(s)
when given). Provenance (`source_name`), the "Sourced listing" label and an off-platform way to apply stay mandatory,
and they are never applied to on-platform. `apply_instructions` (D-016) is also shown on sourced jobs ("How to apply",
e.g. the email subject the employer asks for). Posts that don't name the employer show "Company not disclosed".
The admin Jobs page can publish drafts. First import: 20 posts from JOB_DOCUMENT.docx became 21 drafts (two duplicate
Trajital posts merged; one Lime Software Logics post split into three roles); a gender restriction in one post
("female opportunity") was removed because it is a protected characteristic (principle 5).

## D-024 Performance and visual refresh (2026-11-17)

- The Supabase project is in `ap-southeast-2` (Sydney) while Vercel functions defaulted to `iad1` (US East), so every
  query crossed the Pacific (~1 s per page). `vercel.json` now pins functions to `syd1`, and middleware runs on the
  Node.js runtime so it executes in that region too.
- Session checks use `supabase.auth.getClaims()`: the project signs tokens with ES256, so the JWT is verified locally
  against the cached JWKS instead of a call to Supabase Auth on every request. Access control is unchanged: Postgres RLS
  trusts the same JWT, and `users.status` / role are still read from the database. `getSession()` is memoised per
  request (React `cache`), so the header and the page share one lookup. Anonymous visitors on public pages skip the
  middleware session work entirely. Account deletion still fetches the full Auth user (needs `email_confirmed_at`).
- Visual refresh: indigo/teal design tokens, Geist font (self-hosted via the `geist` package), lucide icons, sticky
  header with active states and a mobile menu, redesigned home/jobs/job/auth pages. No root `loading.tsx`: a root
  Suspense boundary blanked pages after server-action redirects and turned `notFound()` into 200s; the skeleton is
  limited to the read-only jobs list (`src/app/jobs/(list)`).

## D-025 Audit against the v1.0 launch addendum (2026-11-17)

Audit of the deployed app (vouch-jobs.vercel.app, commit 109565b, migrations 000001-000009) against
`docs/requirements.md` and `docs/requirements-v1.0-addendum.md`. Status: **Done** / **Partial** / **Missing**.
Items marked **[ASK]** conflict with something already built and need an owner decision before that milestone.

### What exists today

- Screens: home, `/jobs` search, `/jobs/[uuid]`, auth (signup, login, forgot/reset), onboarding, candidate dashboard /
  profile / settings / privacy, recruiter jobs / new job / job detail / application / company & team / talent pool,
  admin overview / jobs / add sourced job / users / takedowns / audit / feedback, `/takedown`, `/terms`, `/privacy`,
  `/m/[token]` (consent link), `/unsubscribe/[token]`, `/api/health`, `/api/cron/run` (daily).
- Tables: users, candidates (+ skills, experiences, education, certifications), resumes, companies, company_members,
  company_invitations, jobs, matches, consent_events, applications, application_stage_history, interview_feedback,
  redistribution_consent, notifications, audit_log, blocked_companies, takedown_requests, rate_limits. RLS on all.
- Talent pool today (D-022): uploads are rows in `candidates` with `uploaded_by_company_id`; 10 files per upload,
  parsed inside the request; other companies see an anonymous card.

### A1 Workspaces + membership + RLS: Partial

- `companies` + `company_members` (roles admin/recruiter, invitations) already act as a workspace. Gap: no
  `workspaces` / `workspace_members` naming, no workspace for a recruiter without a company (company is now optional),
  no plan/limits columns.
- Proposal: keep `companies` as the workspace table (rename in UI to "Workspace", company name optional) rather than a
  parallel table, so existing jobs, seats and RLS keep working. Add `workspace_id` alias views only if needed.
- **[ASK] Pool visibility.** Addendum: pool is "visible to nobody else". Built (owner choice, D-022): other
  recruiters see an anonymous card. Addendum overrides, so the default plan is to make pools fully private.

### A2 Bulk upload + queue + parse + dedupe + pool search: Partial

- Missing: drag-and-drop, ZIP, 200 files x 5 MB per batch, configurable pool cap (500), per-file status list
  (queued / parsing / done / failed + reason), background queue with retries (today parsing runs in the request).
- Missing: separate `pool_candidates` table scoped by workspace (today uploads share `candidates`); dedupe on
  phone and name+latest employer (today email only); duplicates flagged/merged.
- Missing: tags, private notes, source, status (new/contacted/interested/not interested/hired), `do_not_contact`.
- Missing: pool search and filters (skills, title, location, experience, tags, status) and semantic search.
- Done: protected-characteristic stripping, delete removes file + parsed data + embeddings, Claude parser with
  offline fallback (Claude key not yet set in production, so the fallback parser is used today).
- Plan: browser uploads files straight to private Storage (avoids Vercel's 4.5 MB request limit); a `pool_imports`
  queue table; workers run via `/api/pool/process` called while the page is open plus a pg_cron backstop
  (`supabase/ops/schedule-background-jobs.sql`), because Vercel Hobby cron is daily only (D-018). Move existing
  uploads into `pool_candidates`.

### B1 Optional company, contact validation, source labels, expiry: Partial

- Done: sourced jobs without company ("Company not disclosed"), apply via email/phone/link, 30-day expiry on sourced
  jobs, takedown flow, optional source URL.
- Missing: `source_type` values `employer_posted`, `api_feed`, `csv_import`, `pasted` (today `verified`/`sourced`);
  WhatsApp apply method + click-to-chat; "Hiring directly" and "Source: not specified" labels; any recruiter can add
  sourced jobs to their own workspace (today admin-only); workspace-private vs public-board visibility; expiry +
  "still open?" refresh on all jobs; duplicate detection.
- Gap: job page shows phone/WhatsApp numbers and emails in page text. 7c requires a login or human check to reveal
  them.

### B2 CSV import, then one official connector: Missing

- Missing: connector interface; paste-to-job for every recruiter with review screen (admin-only today); CSV import
  with column mapping; ATS feed (Greenhouse and/or Lever public job-board API) with daily refresh, close-on-disappear,
  dedupe, "From [company] careers page" label, summary in our own words. Terms check per provider to be recorded here
  before building. No scraping (rule 8).

### C1 Pool-vs-job matching and reverse view: Partial

- Done: "Find people for a job" ranks the pool against one job (scoring engine reused).
- Missing: "Top matches from your pool" on the job page with one-line reasons; "Best jobs for this person" on a pool
  candidate; selection of candidates for outreach.

### C2 Outreach: Missing (launch: copy/export only, per 7d)

- Launch scope: "Copy message" and "Export contact + job" (CSV), lawful-basis checkbox stored in the audit log,
  `do_not_contact` respected. Global suppression list table built now; direct email sending after launch (v1.1).
- Note: CLAUDE.md rule 2 (never email resume addresses) still holds at launch because nothing is emailed.

### G1 Public job pages, usage counters and limits: Partial

- Done: public home with live counts, public search, public job pages (server-rendered, per-job title/description),
  rate limits on actions, Terms, Privacy, removal request page.
- Missing: readable job URLs (`/jobs/<slug>-<n>`, old UUID URLs redirect); JSON-LD `JobPosting` with `validThrough`;
  canonical URLs; `sitemap.xml`, `robots.txt`; Open Graph image per job; share buttons (copy, WhatsApp, LinkedIn);
  closed/expired jobs show a friendly "closed" page with similar jobs (today 404); filters for location, job type and
  date posted (today keyword + work mode); company pages; category/location landing pages (only with enough jobs);
  About, How matching works, For recruiters pages; per-IP rate limits on job pages/search; "Get matched to jobs like
  this" signup on job pages; usage counters and plan limits (pool size, sends, sources).

### 8. Remaining v1.0 items

- Done: consent state machine, feedback loop (interview feedback + admin feedback view), admin panel, privacy tools
  (export, delete, consent withdrawal), audit log, takedowns.
- To verify during G1: save a job / job alerts are v1.1 (alerts) or need login (save) and are not built.

### Launch cut line (7d)

Before launch: A1, A2, B1, B2 (CSV + at least one feed connector), C1, 7c, privacy tools, takedown, Terms and Privacy
(legal review still needed). C2 at launch: copy message + export only. After launch (v1.1): direct email outreach,
billing, recruiter network, agency roles, job-alert emails, more connectors.

## D-026 Workspaces, private pools and network introductions (owner decision, 2026-11-17)

- A1: a company row is the workspace (`companies` + `company_members`), so existing jobs, seats, invitations and RLS
  keep working. `kind` is `company` (name shown on jobs) or `personal` (a recruiter hiring without a company; jobs show
  "Hiring directly"; not readable by the public). One workspace per recruiter (`create_workspace`). Plan fields
  (`plan`, `pool_cap` 500, `batch_file_cap` 200, `daily_send_cap` 50, `source_cap` 3) can only be changed by Vouch.
- Talent pools are private to the workspace by default (addendum section 3). This replaces D-022's "other companies
  see an anonymous card": a workspace admin may opt in (`share_pool_anonymously`, audited) to show anonymous cards
  (headline, location, years, skills; never name, contacts or file) to other workspaces.
- Network introductions (C1, owner-approved): a recruiter who sees an anonymous card can request an introduction. The
  full resume is released only after the person agrees: in the app if they have a Vouch account, otherwise via the
  uploading recruiter, who asks them and confirms with a recorded lawful-basis checkbox. Never sold or released
  without consent. Charging for requests waits for billing (v1.1); usage is counted from the start.
- Job display rule (addendum 4): company name when known, otherwise "Hiring directly".

## D-027 Talent Pool bulk upload (A2, 2026-11-17)

- Pool profiles live in `pool_candidates` (scoped by `workspace_id`), separate from the public `candidates` table, as
  the addendum asks. D-022 uploads were moved over by migration 000011 (production had none). RLS: members of the
  workspace only; inserts by the trusted backend only; members edit profile, tags, private notes, status and
  `do_not_contact` (audited); workspace, file, embedding and claim fields are protected by a trigger.
- Upload path: the browser uploads each file straight to the private `resumes` bucket under
  `pool/<workspace>/<import>/` (storage RLS checks membership), so batches of 200 never pass through a Vercel request
  (4.5 MB body limit). ZIPs are unpacked in the browser. `start_pool_import` records the lawful-basis confirmation in
  the audit log and checks the batch cap (200) and pool room (cap 500); `queue_pool_files` only accepts paths in the
  workspace's own folder.
- Queue: `pool_import_files` rows are claimed with `FOR UPDATE SKIP LOCKED`; stale locks re-queue after 5 minutes;
  up to 3 attempts, then `failed` with a reason. Bad files fail immediately and never block others. Workers: the open
  upload page calls `/api/pool/process` until its queue is empty; the daily cron (and the optional pg_cron schedule)
  picks up the rest. Parsing runs in parallel; de-duplication and saving run one file at a time so a batch can't
  insert the same person twice.
- Parsing reuses the Claude parser, falling back to the offline reader. The offline reader now reads work history from
  dated lines, location from the contact line, and never takes digits inside an email as a phone number.
- De-duplication inside a workspace: normalised email, then phone (last 10 digits), then name + latest employer.
  Duplicates are merged (blanks filled, skills added; the first resume file is kept) and the file is marked
  "duplicate" with the matched key. Never silently doubled.
- Search: `search_pool` (security invoker, RLS applies) with keyword, skills (all must match), title, location, minimum
  years, tag and status filters, plus semantic ordering by an embedded query (protected characteristics stripped).
- Claiming (person signs up with the same verified email) copies the details into their own profile; the recruiter's
  pool entry stays, marked "On Vouch" (the addendum makes the pool the recruiter's workspace data). The person can
  still delete it from the pool at any time; account deletion erases pool profiles for their email everywhere.

## D-028 Job sources: optional company, contact methods, labels, expiry (B1, 2026-11-17)

- `source_type` keeps its v1.0 meaning for rule 4 (`verified` = posted by the hiring company and applied to on Vouch;
  `sourced` = from elsewhere, applied to off-platform, always labeled). The addendum's source kinds are a new `origin`
  column: `employer_posted`, `pasted`, `csv_import`, `api_feed`, `email_forwarded`, `manual` (admin-added).
- Company and source are optional. Required: a title and one way to apply (`jobs_contact_method`); sourced jobs need an
  off-platform method: link, email, phone or the new `whatsapp`. Display: company name if known, otherwise "Hiring
  directly"; source label "Sourced from X", "From X careers page" (feeds) or "Source: not specified".
- Any recruiter can add a job from another source to their own workspace (`owner_workspace_id`,
  `visibility = 'workspace'`): only members see it, it is matched against their pool (C1), not marketplace candidates.
  The public board stays admin-moderated: the recruiter asks (`request_job_public`), an admin approves (sets
  `visibility = 'public'`). Only admins can change visibility (trigger). Employer-posted jobs are owned by their company
  workspace and public as before. Public pages filter `visibility = 'public'` explicitly.
- Expiry: sourced jobs expire after 30 days; "Still open?" (`confirm_job_open`) extends by 30 days and re-opens an
  expired job. Recruiters see "Closes in N days. Still open?" in their list from 7 days before.
- Duplicates: `find_similar_jobs` checks the public board plus the caller's own workspace only, so it never reveals
  another workspace's private jobs.
- Private contacts (7c): anonymous visitors cannot read `apply_target` or `apply_instructions` at all (column grants on
  `jobs` for `anon`; new public columns must be added to that grant). The job page masks phone/WhatsApp numbers and
  personal emails (company addresses like jobs@ are shown) and reveals them to signed-in users, or after a signed,
  15-minute "what is a + b" check bound to the job, rate limited per IP (`reveal`, 40/hour). Apply links are shown
  directly. WhatsApp opens click-to-chat (`wa.me`).

## D-029 Paste, CSV import and company career feeds (B2, 2026-11-17)

- Connectors are plugin-style (`src/lib/connectors`): a `FeedConnector` turns one company's public board into
  normalized jobs; adding a provider is one file plus one registry line (and the `job_feeds.provider` check).
- Paste: every recruiter can paste a post (`/recruiter/jobs/add`) and review the extracted fields. When AI parsing is
  off (no Claude key in production yet) an offline reader pre-fills title, company, location, apply method
  (email / WhatsApp / phone / link), work mode, job type, years and skills.
- CSV: `/recruiter/sources`, up to 500 rows, comma/semicolon/tab files, column-mapping step with automatic guesses,
  preview, then per-row results (added / skipped as duplicate / not added with the reason). Rows go through the same
  validation as the form (title + one way to apply) and land in the workspace with `origin = csv_import`.
- Feeds: Greenhouse Job Board API and Lever Postings API. Terms check (2026-11-17): both offer public, unauthenticated
  GET endpoints documented for building career sites / job sites (Greenhouse: developers.greenhouse.io/job-board;
  Lever: github.com/lever/postings-api, which also notes published postings are public). We use only those read
  endpoints, once a day per board (cron; "Fetch now" is rate limited), identify ourselves with a `VouchJobsBot`
  User-Agent, store a summary in our own words (AI rewrite when available, otherwise a factual template: title, team,
  location, type, skills mentioned) plus the company's own apply link, label jobs "From [company] careers page", and
  never apply for anyone. The owner should re-read each provider's terms before scaling. Plain career-page fetching
  (robots.txt + schema.org JobPosting) and other ATSs (Ashby, SmartRecruiters, Workable) are not built yet (v1.1
  "additional connectors"); no scraping of job portals (rule 8).
- Every run re-checks each job: listed jobs stay open (+30 days), missing ones are closed (takedown removals stay
  removed), reappearing ones re-open, and new jobs that duplicate an existing listing (public board or this
  workspace) are skipped. Feeds count against the plan's `source_cap` (3 on free).

## D-030 Pool matching views and network introductions (C1, 2026-11-17)

- Every recruiter job page (employer-posted or from another source) shows "Top matches from your pool": the v1.0
  pipeline (vector similarity, skill overlap, experience fit) with the score and a one-line reason. Workspace jobs are
  embedded on demand. The reverse view on a pool profile shows "Best jobs for this person" across the workspace's open
  jobs and the public board.
- Below it, "From the Vouch network" lists anonymous cards from pools whose workspace opted in to sharing (D-026);
  do-not-contact people never appear. "Request introduction" (`intro_requests`, rate limited 30/day per recruiter):
  - if the person is on Vouch (claimed the profile), they answer in their dashboard;
  - otherwise the uploading workspace asks them outside Vouch and records the answer; "they agreed" requires a
    lawful-basis confirmation, stored in the audit log.
  The requester sees only an anonymous, pending request until it is accepted; then the profile, contact details and
  resume (signed URL) for that job. Declines reveal nothing. The uploading workspace is never named to the requester,
  and private notes, tags and status never leave the workspace (all reads go through definer functions that select
  only profile columns). Charging for introductions waits for billing (v1.1); requests are counted.

## D-031 Outreach with safeguards (C2, 2026-11-17)

- From a job's "Top matches from your pool", the recruiter selects people and clicks "Send this opportunity". The
  preview shows the message: their note, the job summary, how to apply (Vouch job page for employer-posted public jobs,
  the employer's link/email/phone/WhatsApp for sourced jobs, otherwise "reply to me"), the recruiter's name and
  workspace, why the person is receiving it, and a personal one-click opt-out link.
- Launch scope (7d): "Copy message" and "Export contact + job" (CSV). Direct email is built and uses the same checks,
  but is off unless `OUTREACH_EMAIL_ENABLED=true` (turn on after SPF/DKIM/DMARC and warm-up). Emails carry
  `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058).
- `prepare_outreach` (database) decides who may be contacted, for every channel: requires the lawful-basis checkbox
  (audited), skips do-not-contact people and anyone on the global suppression list, applies the workspace daily cap
  (`daily_send_cap`, 50 on free) and, for email, 1 message per address per 7 days across all of Vouch. Contacted people
  move from "new" to "contacted".
- Opt-out: `/stop/<signed token>` (a button confirms, so mail scanners can't trigger it). It suppresses the address for
  every workspace. We store only a salted SHA-256 of the normalised email/phone (`contact_hash`).
- Complaints (Resend webhook `email.complained`) suppress the address and pause email outreach for a workspace whose
  complaint rate over 30 days exceeds 0.3% (min. 3 complaints). Only Vouch can lift the pause.
- Note for the owner (addendum 5): laws on contacting people from collected resumes vary by country; have a qualified
  person review before sending at scale.

## D-032 Public pages, discoverability and usage counters (G1 + 7c, 2026-11-17)

- Job URLs are readable and stable: `/jobs/<title>-<city>-<number>` (`jobs.public_number`, from 1001). Old
  `/jobs/<uuid>` links and slugs with an outdated title redirect permanently to the current URL.
- Every job page is server-rendered with a unique title and description, a canonical URL, Open Graph / Twitter card
  tags and a generated share image (`opengraph-image`), schema.org `JobPosting` JSON-LD with `validThrough` (no
  personal contacts; hiring organization "Confidential employer" when unknown), share buttons (copy link, WhatsApp,
  LinkedIn), "Get matched to jobs like this" for visitors, save job and, on employer-posted jobs, "Apply with my Vouch
  profile". Applying directly is a consent: `apply_to_job` creates the match and runs it through `respond_to_match`
  (rule 1), so a consent event is recorded.
- A job that was public but is closed or expired shows a friendly "This job is closed" page with similar open jobs
  (noindex), not a 404.
- `/sitemap.xml` (live public jobs, landing pages, company pages, static pages; no contacts) and `/robots.txt`
  (private areas disallowed).
- Search covers all public jobs with keyword, location, work mode, job type and date posted, paginated (30 per page,
  no "log in to see more").
- Landing pages from real data: `/jobs/<category>`, `/jobs/<city>`, `/jobs/<category>/<city>`; generated only when
  they have at least 3 open jobs. Company pages `/companies/<slug>` for company workspaces and named hiring companies.
- Static pages: About, How matching works, For recruiters (incl. the VouchJobsBot note), Terms, Privacy, Request
  removal.
- Abuse protection: per-IP limits in middleware (240 page / 120 API requests per minute per instance; in memory, no
  database round trip), plus the database-backed limits on sensitive actions. `RATE_LIMIT_SCALE` multiplies limits
  for local/CI end-to-end runs and is ignored in production.
- Usage counters for plans: `workspace_usage` (pool size, messages today and in 30 days, connected sources,
  introductions, open jobs) shown against the plan's limits on the workspace page. Billing is v1.1.

## D-033 v1.0 launch status (2026-11-17)

Everything in the addendum's build order (section 7) and the 7d launch cut line is built and deployed: A1, A2, B1, B2,
C1, C2 (launch scope: copy message + export; email behind `OUTREACH_EMAIL_ENABLED`), G1 and 7c. Remaining v1.0
items were re-checked: privacy export now also covers saved jobs, introduction requests and profiles recruiters hold
about the person; Privacy and Terms drafts describe talent pools, introductions, recruiter messages and opt-outs.

Still needed from the owner before or at launch (not code):
- Legal review of Terms and Privacy (both marked DRAFT), and of recruiter outreach for the countries you operate in.
- API keys in Vercel: `ANTHROPIC_API_KEY` (AI parsing and summaries; the offline readers are used until then),
  `VOYAGE_API_KEY` + `EMBEDDINGS_PROVIDER=voyage` (better matching), `RESEND_API_KEY` + `EMAIL_FROM` and
  `RESEND_WEBHOOK_SECRET` (email + complaint handling).
- Sending domain with SPF/DKIM/DMARC, warmed up, before setting `OUTREACH_EMAIL_ENABLED=true` (right after launch).
- Optional: `supabase/ops/schedule-background-jobs.sql` for frequent background runs (Vercel Hobby cron is daily).

After launch (v1.1, per 7d): direct email outreach at scale, paid plans and billing, recruiter-to-recruiter job
sharing, agency roles beyond the current admin/recruiter seats, job-alert emails, more connectors (Ashby,
SmartRecruiters, Workable, schema.org career pages with robots.txt checks).

## D-034 Admins can do everything recruiters can (product owner, 2026-11-18)

The admin account also gets the recruiter area: its own workspace, bulk resume upload, bulk job import (CSV, paste,
feeds), matching and outreach. Admin status gives no access to other workspaces' pools (RLS unchanged). On jobs from
other sources, admins may tick "Put on the public job board" (the database ignores this for non-admins). The admin
menu lists both admin and recruiting pages.

## D-035 Brand, themes and recruiter home (2026-11-18)

- Logo: the product owner's "two roots" mark (two nested arches): an ink outer arch and a violet inner arch, drawn as
  SVG (`src/components/logo.tsx`, `src/app/icon.svg`, share images). The brand colour moved from indigo to the logo's
  violet (`--primary` #6d28d9 light / #a78bfa dark).
- Light, dark and system themes: a switch in the header (sun / moon / monitor). The choice is stored in this browser
  (`localStorage`), applied before first paint by an inline script (`data-theme` on `<html>`), and follows the system
  setting when set to "system". Without JavaScript the system setting applies. Tailwind `dark:` utilities follow
  `data-theme`. Axe accessibility checks run in both themes.
- Recruiter home: quick numbers (pool, open jobs, messages today, introduction requests), a getting-started checklist
  that disappears once done, and shortcuts to upload resumes, import jobs and post a job.

## D-036 Job pictures (2026-11-18)

A recruiter or admin can upload a picture of a job post (PNG, JPG or WebP, max 5 MB) while posting or editing a job.
With AI configured (`ANTHROPIC_API_KEY`), Claude reads the picture and fills in the form for review; without it the
picture is kept and the recruiter fills in the fields. Pictures live in a private `job-images` bucket under the
workspace's folder (checked by a trigger) and are served through short-lived signed URLs (`/api/job-image/<job>`).
Flyers often show phone numbers, so a picture is shown to everyone only when the uploader ticks "this picture shows no
personal phone numbers or email addresses"; otherwise only signed-in users and the job's workspace see it (7c).

## D-037 More career feeds and forward-by-email jobs (2026-11-18)

- New connectors (same rules as D-029: official public job-board endpoints only, once a day, summary in our own words,
  apply on the company's own page):
  - Ashby: `api.ashbyhq.com/posting-api/job-board/<name>`, documented by Ashby as a public, no-key job postings API.
  - Recruitee: `<company>.recruitee.com/api/offers/`; Recruitee's docs say it "does not require authorization".
  - Workable: `apply.workable.com/api/v1/widget/accounts/<account>`, the public widget endpoint career pages use.
    Workable's own docs for it were not found; it is rate limited (429 is reported as "try again tomorrow").
  - SmartRecruiters: `api.smartrecruiters.com/v1/companies/<CompanyId>/postings` (paged). SmartRecruiters' docs are
    inconsistent about keys and some plans don't publish the feed; 401/403 shows "this company doesn't publish a public
    job feed". The list has no description, so the summary is built from its labelled facts.
  Tested against real Ashby and SmartRecruiters responses (trimmed fixtures in `tests/fixtures/feeds`). The owner
  should re-read each provider's terms before scaling.
- Forward-by-email: each workspace can create a private inbox URL (`/api/inbound/jobs/<secret>`, `job_inboxes`, reset
  by workspace admins). An email-forwarding service (Cloudflare Email Routing, Mailgun routes, SendGrid Inbound Parse)
  posts emails there as JSON or form data; each becomes a DRAFT job in the workspace (`origin = email_forwarded`) after
  removing forwarding headers, reading it (AI when configured, else the offline reader), skipping duplicates and emails
  with no way to apply. Limited to 200 emails per workspace per day.
- Not built: job-board partner APIs (Adzuna, Jooble, Careerjet) need the owner to sign up for keys first.

## D-038 Admin feeds publish publicly; PDF reading on Vercel (2026-11-18)

- Feeds connected by a Vouch admin publish their jobs on the public job board (`job_feeds.publish_public`, on by
  default for admins, switchable per feed by admins only). Recruiters' feeds stay in their workspace as before.
- Resume PDFs failed to read on Vercel ("could not read the file") although they worked locally. pdf-parse now loads
  pdf.js's worker and canvas helpers explicitly (`pdf-parse/worker`), as its docs recommend for serverless, and
  `@napi-rs/canvas` is kept external. `/api/health?deep=1` reads a sample PDF on the server to check this.

## D-039 Search feeds from free job APIs (2026-11-19)

- A search feed fetches jobs daily by keywords and an optional place (`job_feeds.board` = `keywords|location`).
  Jobs keep their real hiring company and are labeled "Sourced from <site>" with a link to the original listing.
  Search feeds don't close jobs that drop out of a day's results (they only return the latest matches); those jobs
  expire after 30 days.
- No-key sources, with the terms from their API responses:
  - Remotive (remote jobs): link back and name Remotive; fetch at most a few times a day; do NOT pass its jobs on to
    Google Jobs; don't gate listings behind sign-up.
  - Remote OK (remote jobs): link back with a followed link (no `nofollow`) and name Remote OK; don't use its logo.
  - Arbeitnow (mostly Germany/Europe): free public API, don't abuse, linking back appreciated.
  To respect these, jobs from aggregator search feeds carry no schema.org JobPosting data (not submitted to Google
  Jobs), and Remote OK links are followed.
- Partner-key sources (shown as "needs key" until set): Jooble (`JOOBLE_API_KEY`) and Careerjet (`CAREERJET_AFFID`),
  both covering Pakistan. Their partner terms must be checked when the keys are issued; the Careerjet endpoint should
  be confirmed against the docs that come with the affiliate account.
- Not possible: LinkedIn, Indeed, Rozee, Glassdoor and JobLeads offer no public feed and forbid scraping. Their job
  alert emails can be forwarded to the workspace inbox (D-037) for private matching.
