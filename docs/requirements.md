# Vouch: Complete Product & Build Specification (v1.0)

> Audience: Claude Code (and the solo developer). This is the single source of truth. When something here conflicts with an assumption, follow this document. When something is not covered, ask before inventing behavior, and prefer the safer, consent-first option.

---

## 1. What We Are Building

A **two-sided hiring marketplace** with an automated matching engine.

- **Candidates** upload a resume and get a structured profile.
- **Recruiters/companies** post jobs.
- The system **ranks candidates against each job**, then **asks the candidate for permission** before any application is sent.
- Recruiters see a ranked shortlist of candidates who said yes.
- After interviews, recruiters can **redirect good-but-wrong-fit candidates** to other opportunities (the Talent Redistribution Loop), with the candidate's opt-in.
- The platform also lists **sourced (external) jobs**, clearly labeled, so it is useful before many employers have joined.

**One-line pitch:** "Your resume gets matched to jobs automatically, and nothing happens without your permission."

---

## 2. Non-Negotiable Principles

These override convenience. If a feature would violate one, do not build it that way.

1. **Consent before action.** No application is submitted, and no candidate is surfaced to another company, without the candidate's explicit opt-in.
2. **No unsolicited marketing email.** Never email addresses extracted from resumes unless that person has claimed their profile or signed up and opted in. Resume text is never a mailing list.
3. **Never impersonate an employer.** Sourced jobs are labeled as sourced. We never present ourselves as the hiring company.
4. **Raw recruiter criticism stays internal.** Other companies and candidates see structured strengths and suggested roles, not blunt rejection notes.
5. **Every match/notify/apply event is auditable.**
6. **Privacy baseline is GDPR-like everywhere:** export my data, delete my account, explicit consent, easy unsubscribe.
7. **Matching uses skills and experience only.** Never use protected characteristics (age, gender, religion, ethnicity, marital status, photo, nationality) or obvious proxies as scoring inputs.
8. **Keep it simple.** Solo build, managed services, no premature optimization.

---

## 3. Scope

### 3.1 In MVP (Phase 1)
- Auth for candidates and recruiters
- Candidate profile + resume upload + AI parsing + manual correction
- Company accounts + job posting (including paste-to-structure)
- Matching engine (hard filters + semantic similarity; LLM re-rank optional/toggle)
- Match notification email with Approve / Decline
- Application pipeline for recruiters
- Interview feedback + Talent Redistribution Loop (with opt-in)
- Sourced jobs (manual paste by admin only) with clear labeling, expiry, takedown
- Basic admin panel
- Privacy tools: data export, account deletion, unsubscribe

### 3.2 Explicitly NOT in MVP (do not build)
- SMS notifications
- In-app messaging between recruiter and candidate
- Auto-approve rules
- Payments / billing (everything free at first)
- Automated scraping of job portals
- Bulk import UI (design the schema for it, build the UI in Phase 2)
- Mobile app
- Analytics dashboard beyond a few admin counts
- Multi-language UI

### 3.3 Things the system must NEVER do
- Submit an application without candidate approval
- Email people scraped from resumes who have not opted in
- Scrape LinkedIn, Indeed, or similar sites automatically
- Show a recruiter's raw "weaknesses" notes to candidates or other companies
- Use protected characteristics in matching
- Expose one company's data (pipeline, notes) to another company
- Store passwords in plaintext, or resumes in a public bucket

---

## 4. Roles & Permissions

| Role | Can do | Cannot do |
|---|---|---|
| **Candidate** | Manage own profile/resume, set preferences, approve/decline matches, view own applications, control visibility, export/delete own data | See other candidates, see recruiter private notes |
| **Recruiter** | Post/edit own company's jobs, view ranked matches and consenting applicants for own jobs, run pipeline, write interview feedback, upload resumes to the company talent pool (see D-022) | See candidates who have not consented or are not matched/applied, see other companies' data, see identifying details of unclaimed profiles uploaded by another company (anonymous card only, D-022) |
| **Company Admin** | Everything a recruiter can + manage recruiter seats | Access other companies |
| **Platform Admin** | Moderate users/jobs, add sourced jobs, handle takedowns, view audit log | Read private recruiter notes without a logged reason |

Enforce all of this with **Supabase Row Level Security (RLS)** policies, not only in application code.

---

## 5. Modules (what each should contain)

### 5.1 Authentication & Accounts
**Contains:** email+password, Google OAuth, email verification, password reset, role selection at signup (candidate or recruiter), company creation for recruiters.
**Does not contain:** social login beyond Google in MVP; phone-number login.

### 5.2 Candidate Profile & Resume
**Contains:**
- Resume upload (PDF, DOCX; max 5 MB)
- AI parsing into structured fields: name, contact, summary, skills (list), work experience (title, company, dates, description), education, certifications, languages, location
- A review screen showing parsed results; candidate can edit every field
- Preferences: desired roles, industries, locations, remote/hybrid/onsite, salary range + currency, availability, "open to opportunities" toggle
- Visibility controls: pause profile, block specific companies
- Notification preferences: match emails on/off, frequency, unsubscribe
- Original file stored privately; parsed data stored in the database

**Does not contain:** profile photo requirement; fields for age, gender, marital status, religion, nationality (strip or ignore these if present in a resume).

### 5.3 Company & Job Posting
**Contains:**
- Company profile (name, website, description, size, location)
- Job form: title, description, required skills, nice-to-have skills, min/max experience years, location, work mode, employment type, salary range (optional), how to apply, expiry date
- **Paste-to-structure:** recruiter pastes raw job text, AI extracts the fields, a pre-filled form appears, recruiter reviews and publishes
- Job statuses: draft, published, paused, closed, expired
- Every job has a `source_type`: `verified` (posted by the employer on our platform) or `sourced` (external; see 5.9)

**Does not contain:** automatic publish without review; posting on behalf of a company the user does not belong to.

### 5.4 Matching Engine
See Section 7 for the full spec.

### 5.5 Consent & Notification Flow (core feature)
See Section 8 for the state machine.

**Contains:** match notification email + in-app notification, Approve/Decline via secure one-click link (signed, expiring token) and in the app, per-match audit trail, notification throttling (max N match emails per candidate per week, configurable).

**Does not contain:** SMS, push notifications, auto-approve.

### 5.6 Recruiter Pipeline
**Contains:** per-job ranked list of consenting applicants with match score and explanation; filters (score, location, experience, availability); stages: New, Reviewed, Interview, Offer, Hired, Rejected, Redirected; stage change history.

**Does not contain:** calendar scheduling, offer-letter generation.

### 5.7 Interview Feedback & Talent Redistribution Loop
After a recruiter decides a candidate is not right for this job:
1. Recruiter completes an **Interview Feedback** form:
   - Outcome: `not_a_fit` or `good_fit_different_role`
   - Strength tags (structured, e.g. "strong copywriting")
   - Growth-area tags (**internal only**)
   - Suggested roles/domains
   - Optional 1-5 rating
   - Optional private note (**internal only, never shown outside the company/admin**)
2. If outcome is `good_fit_different_role`, the candidate is notified: "[Company] reviewed you for [Job]. They flagged you as strong for [domains]. Want to be visible to other recruiters hiring in these areas?"
3. Candidate opts in per domain (they can edit or decline).
4. Opted-in candidates appear in other recruiters' matches with an **"Interview-vetted"** badge and the strengths (not growth areas).
5. Verified strengths are stored as a **separate, higher-weight signal** in matching for the recommended domains.

**Rules:** no visibility to other companies without opt-in; candidates can withdraw at any time; the originating company name is shown only if the company allows it (default: hidden, shown as "a previous employer's recruiter").

### 5.8 Admin Panel
**Contains:** user list/search, suspend user, job moderation queue, sourced-job creation, takedown requests, audit log viewer, basic counts (users, jobs, matches, approvals).
**Does not contain:** advanced analytics, revenue reports.

### 5.9 Sourced (External) Jobs
Jobs found elsewhere that an **admin** pastes in.

**Contains:**
- Paste-to-structure with a **review screen** before publishing
- Mandatory fields: source name, source URL, date added, how to apply (email, phone, or link)
- Store a **structured summary in our own words**, not a verbatim copy of the full description
- Visible label on every sourced job: **"Sourced from [name]. Apply via the original listing."** Visually distinct from verified jobs
- Candidate flow for sourced jobs: match notification with link or contact details; **no auto-apply and no pretending the employer is on the platform**
- **Auto-expiry** (default 30 days) and duplicate detection (title + company + location + similarity)
- **Takedown:** a public "request removal" contact; honored promptly; removal logged
- Prefer sources that allow reuse: company career pages, official APIs, jobs sent directly
- Contact details: company hiring addresses (jobs@, careers@) are fine; avoid storing individual recruiters' personal emails or phone numbers unless clearly published for applicants

**Does not contain:** automated scraping, posting by regular users in MVP, claiming the company is our customer.

---

## 6. Data Model (entities and key fields)

Use PostgreSQL via Supabase. All tables: `id (uuid)`, `created_at`, `updated_at`. Enable RLS on every table.

- **users** (linked to Supabase auth): role, email, status
- **candidates**: user_id (nullable for unclaimed), claim_status (`claimed` / `unclaimed`), full_name, headline, summary, location, work_mode_pref, salary_min/max/currency, availability, open_to_work, visibility_paused
- **resumes**: candidate_id, storage_path, original_filename, parsed_json, parse_status, embedding (vector)
- **candidate_skills**: candidate_id, skill, source (`self` / `parsed` / `verified`), weight
- **experiences**, **education**, **certifications**: candidate-linked rows
- **companies**: name, website, description, size, location, status
- **company_members**: company_id, user_id, role
- **jobs**: company_id (nullable for sourced), source_type, source_name, source_url, title, description_summary, required_skills, nice_skills, min_exp, max_exp, location, work_mode, employment_type, salary_min/max/currency, apply_method, apply_target, status, expires_at, embedding (vector)
- **matches**: job_id, candidate_id, score, score_breakdown (json), explanation, status (see Section 8), notified_at, responded_at
- **applications**: match_id (nullable), job_id, candidate_id, stage, applied_at, consent_event_id
- **application_stage_history**: application_id, from_stage, to_stage, changed_by, changed_at
- **interview_feedback**: application_id, recruiter_id, outcome, strengths (tags), growth_areas (internal), suggested_domains, rating, private_note (internal)
- **redistribution_consent**: candidate_id, feedback_id, domain, status (`pending` / `opted_in` / `declined` / `withdrawn`), updated_at
- **consent_events** (append-only): candidate_id, type, subject_id, granted/denied, ip/user agent hash, timestamp
- **notifications**: user_id, type, payload, channel, sent_at, delivery_status
- **audit_log** (append-only): actor, action, entity, entity_id, metadata, timestamp
- **blocked_companies**: candidate_id, company_id
- **takedown_requests**: job_id, requester_contact, reason, status, resolved_at

Design the schema so **bulk import and unclaimed candidates** work later (nullable user_id, claim_status), even though the import UI is Phase 2.

---

## 7. Matching Engine Specification

**Trigger:** when a job is published or edited, and when a candidate profile is created or materially updated.

**Pipeline:**
1. **Hard filters (SQL):** open_to_work true, profile not paused, not blocked company, claimed (or opted-in) profiles only, location/work-mode compatibility, minimum experience, required certifications if specified.
2. **Semantic similarity (pgvector):** embed the job and each resume/profile; rank by cosine similarity; take top N (default 50).
3. **Skill overlap score:** compare required and nice-to-have skills against candidate skills; verified skills (from interview feedback) get a higher weight.
4. **Combined score (0-100):** weighted blend of semantic score, skill overlap, experience fit, and verified-strength boost. Weights live in one config file so they can be tuned.
5. **Optional LLM re-rank + explanation (toggle, top 20 only):** produces a short human-readable explanation ("Matched on: 5 years social media marketing, Meta Ads certification, 3 campaigns in portfolio").
6. **Threshold:** only candidates at or above a configurable score (default 70) enter the notify step.

**Requirements:**
- Every match stores its score breakdown and explanation.
- Never use protected characteristics as inputs; strip them before embedding.
- Re-running matching must be idempotent (no duplicate matches or duplicate emails).
- Sourced jobs get matched too, but their notifications contain a link/contact, not an in-platform application.

---

## 8. Consent & Notification State Machine

**Verified-job match:**
`suggested` -> `notified` -> (`approved` -> `applied`) | `declined` | `expired`

- `suggested`: engine created the match; nothing sent.
- `notified`: email + in-app notice sent (respecting weekly throttle).
- `approved`: candidate clicked approve. A `consent_event` is written.
- `applied`: application record created and visible to the recruiter.
- `declined`: candidate declined; never re-notify for this job.
- `expired`: no response after 14 days (configurable); no application made.

**Sourced-job match:** `suggested` -> `notified` (with link/contact) -> `viewed`. No in-platform application.

**Redistribution consent:** `pending` -> `opted_in` | `declined`; `opted_in` -> `withdrawn` at any time.

**Rules:**
- No transition to `applied` without a prior `approved` consent event.
- Email links use signed, expiring, single-purpose tokens.
- Every transition writes to `audit_log`.

---

## 9. Security & Privacy Requirements

- RLS on every table; test that cross-company and cross-candidate access is impossible.
- Resume files in a **private** storage bucket; access via short-lived signed URLs.
- Encrypt in transit (HTTPS) and at rest (provider default).
- Validate uploads: file type, size, and sandbox parsing; never execute uploaded content.
- Rate-limit auth, upload, and email-sending endpoints.
- Secrets only in environment variables; never committed.
- Input sanitization everywhere (including pasted job text).
- **Data export:** candidate can download all their data as JSON.
- **Account deletion:** removes profile, resume files, embeddings, and consents; keeps only minimal anonymized audit entries.
- Every email has an unsubscribe link and a clear sender identity.
- Terms of Service and Privacy Policy pages required before launch (draft, then have them reviewed by a qualified person).
- Log access to sensitive data by admins.

---

## 10. Non-Functional Requirements

- New job published -> matches computed within minutes (seconds preferred) at expected scale (hundreds to low thousands of resumes in year one).
- Email delivery with retry and delivery status tracking.
- Responsive web UI (mobile-friendly), accessibility basics (labels, contrast, keyboard use).
- Typed codebase (TypeScript), linting and formatting enforced.
- Environment separation: local, staging, production.
- Graceful failures: if AI parsing fails, the candidate can fill the profile manually.
- Cost awareness: LLM calls only where they add value (parsing, paste-to-structure, optional re-rank on top 20).

---

## 11. Tech Stack

| Layer | Choice |
|---|---|
| Frontend + API | Next.js (TypeScript, App Router) |
| UI | Tailwind CSS + shadcn/ui |
| Database / Auth / Storage | Supabase (Postgres, Auth, Storage, pgvector) |
| AI | Claude API for resume parsing, paste-to-structure, optional re-rank/explanations; an embeddings provider for vectors |
| Email | Resend (or SendGrid) |
| Background jobs | Supabase Edge Functions / cron, or a simple queue (e.g. Inngest, Trigger.dev) for matching and emails |
| Hosting | Vercel + Supabase |
| Validation | Zod |
| Testing | Vitest (unit), Playwright (end-to-end) |
| Payments (Phase 2) | Stripe |

Migrate vector search to a dedicated vector DB only if the pool exceeds roughly 200-500k profiles.

---

## 12. Suggested Repository Structure

```
/
  CLAUDE.md
  docs/
    requirements.md        <- this file
    decisions.md           <- log of design decisions made during the build
  supabase/
    migrations/            <- SQL migrations (schema + RLS)
    seed.sql               <- realistic sample data
  src/
    app/                   <- Next.js routes (candidate, recruiter, admin, public)
    components/
    lib/
      matching/            <- engine, scoring config, tests
      parsing/             <- resume + job parsing
      consent/             <- state machine, token signing
      email/
      supabase/
    types/
  tests/
    rls/                   <- row-level-security tests
    consent/               <- consent rule tests
    e2e/
```

---

## 13. Build Order (milestones with acceptance criteria)

Build in thin vertical slices. Finish and test each before starting the next. Commit after each.

**M0. Foundation**
- Next.js + Supabase project, env setup, lint/format, CI running tests.
- *Done when:* app boots locally, a health page works, migrations apply cleanly.

**M1. Schema + RLS**
- All Section 6 tables, RLS policies, seed data.
- *Done when:* RLS tests prove a candidate can't read others, a recruiter can't read another company's data, and unclaimed/non-consenting candidates are invisible to recruiters.

**M2. Auth + roles**
- Signup/login for candidate and recruiter, company creation.
- *Done when:* each role lands on the right dashboard and can't access the other's routes.

**M3. Candidate profile + resume parsing**
- Upload, parse, review/edit screen, preferences.
- *Done when:* a sample resume produces an editable profile; parse failure falls back to manual entry.

**M4. Job posting + paste-to-structure**
- Job form, AI extraction, review screen, statuses.
- *Done when:* pasted text becomes a reviewed, published job.

**M5. Matching engine**
- Filters, embeddings, scoring, threshold, idempotency.
- *Done when:* on seeded realistic data, a "social media marketing" job ranks relevant candidates above unrelated ones, and tests cover that.

**M6. Notify / approve / apply**
- Emails, signed tokens, state machine, consent events, recruiter pipeline.
- *Done when:* tests prove no application exists without an approval event; throttling and expiry work.

**M7. Interview feedback + redistribution**
- Feedback form, candidate opt-in, "Interview-vetted" badge, verified-signal boost.
- *Done when:* a redirected candidate appears to other recruiters only after opting in, and growth areas/private notes are never exposed.

**M8. Sourced jobs + takedown**
- Admin paste flow, labeling, expiry, duplicate detection, removal.
- *Done when:* sourced jobs are visibly labeled, expire automatically, and takedown removes them.

**M9. Admin panel + privacy tools**
- Moderation, audit log, data export, account deletion, unsubscribe.
- *Done when:* export and deletion work end to end.

**M10. Hardening + launch prep**
- Rate limiting, error handling, accessibility pass, legal pages drafted, staging review.

---

## 14. Testing Requirements

Must-have automated tests:
- **RLS tests:** cross-user and cross-company access denied.
- **Consent tests:** application cannot be created without an `approved` consent event; declined matches never re-notify; redistribution visibility requires opt-in.
- **Privacy tests:** growth areas and private notes never appear in other users' queries.
- **Matching tests:** fixed fixture set of resumes and jobs with expected ranking; idempotency.
- **Email tests:** throttling, signed token expiry, unsubscribe.
- **E2E happy path:** recruiter posts job -> candidate gets match -> approves -> recruiter sees applicant.

---

## 15. Phase 2 and Later

- ~~Bulk resume import UI with claim/verify flow for unclaimed profiles~~ — brought forward by the product owner on 2026-11-16 as the recruiter talent pool (D-022)
- Opt-in job alert emails for claimed candidates
- ~~Job aggregation from official APIs~~ — brought forward by the v1.0 launch addendum (Greenhouse and Lever feeds, D-029)
- Auto-approve rules (opt-in)
- Recruiter-candidate messaging
- Monetization: free for candidates always; recruiters pay later, starting with pay-per-unlock of matched candidates, then subscriptions (Stripe)
- LLM explanations at scale, analytics dashboard, mobile app, SMS

---

## 16. Decisions Already Made

| Topic | Decision |
|---|---|
| Market | Global, GDPR-like baseline everywhere |
| Team | Solo; lean MVP, managed services |
| Application model | Match, then candidate confirms, then apply |
| Resume sources | Candidate upload now; bulk import later as "unclaimed" |
| Feedback visibility | Raw weaknesses and private notes stay internal |
| Sourced jobs | Admin-only, labeled, summarized, expiring, takedown-ready |
| Scale (year 1) | Hundreds to low thousands; pgvector is enough |
| Monetization | Free at first; recruiter-side later |

## 17. Open Items (resolve during the build, log in docs/decisions.md)

- Exact scoring weights (tune on real examples)
- Embeddings provider choice
- Match email frequency cap default
- Whether the originating company name is shown on "Interview-vetted" badges (default: hidden)
- Final legal text for Terms and Privacy (needs professional review)
