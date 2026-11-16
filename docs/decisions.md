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
