# Vouch: v1.0 Launch Addendum

> Copied from the product owner's PDF (2026-11-17). Overrides docs/requirements.md where they conflict.

```text
    This document OVERRIDES requirements.md wherever they conflict. v1.0 treated the
    marketplace as the core and pushed bulk resume upload and job-source connection to "Phase 2".
    That was the wrong priority. The product owner's core use case is an HR/recruiter workspace.
    Rebuild priorities accordingly. Everything in this addendum is part of the v1.0 launch. The label
    "v1.1" is reserved for what we build AFTER the public launch. Do not delete working v1.0 code;
    extend it.
1. Corrected core vision
Vouch is first of all a workspace for an HR person or recruiter:
  1. The recruiter logs in and bulk-uploads many resumes (hundreds at a time) into their own
     private Talent Pool.
  2. The recruiter connects job sources (official job APIs/feeds, CSV, paste) so jobs flow in
     continuously.
  3. Vouch matches each job against the pool and shows a ranked list with explanations.
  4. The recruiter picks candidates and sends them the opportunity (email / apply link), with
     candidate opt-out always honored.
  5. The candidate-facing marketplace (v1.0) stays, as a growth channel (see section 6), but is no
     longer the entry point.
2. What changes from v1.0
v1.0 said                    v1.0 launch says

Bulk import UI is NOT in     Bulk upload is the #1 feature (M-A below)
MVP

Job aggregation is Phase 2   Job sources are the #2 feature (M-B below)

Sourced jobs: admin-only     Any recruiter can add/connect sourced jobs into their own workspace
                             (admin-only applies only to jobs shown on the public board)

Every job has a company      Company is OPTIONAL. Required: title + at least one contact method
                             (email, phone, or apply link)

Candidates visible only      Resumes a recruiter uploads are private to that recruiter's workspace
after claiming profile       (visible to nobody else). Claiming matters only for the public marketplace

Principle 2: never email     Revised in section 5: recruiter-initiated outreach with safeguards. The
resume addresses             platform never emails anyone on its own initiative
Keep unchanged: matching engine design (section 7 of v1.0), consent state machine for marketplace
applications, RLS everywhere, private storage, audit log, no protected characteristics in scoring.
3. Milestone A: Recruiter Talent Pool (bulk resume upload)
UI: a "Talent Pool" page. Drag-and-drop multiple PDF/DOCX files, or one ZIP. Show a per-file status
list (queued, parsing, done, failed with reason).
Rules:
     Limits per upload batch (configurable): 200 files, 5 MB per file. Free-tier total pool cap
     (configurable, e.g. 500).
     Parsing runs in a background queue, never in the request. Retry failed parses; failures never
     block other files.
     Reuse the existing resume parser (Claude API). Output: structured profile + embedding.
     De-duplication inside a workspace: match on normalized email, then phone, then name+latest
     employer. Duplicates merge or are flagged, never silently doubled.
     Every pool candidate has: tags, free-text notes (private), source ("uploaded by me"), status
     (new, contacted, interested, not interested, hired), do_not_contact flag.
     Search and filter the pool: skills, title, location, experience, tags, status, plus semantic search
     ("social media marketer with Meta Ads").
     Data model: workspaces , workspace_members , pool_candidates (scoped by
      workspace_id ; separate from public candidates ). RLS: a workspace's pool is readable only
     by its members. Add RLS tests.
     Deleting a pool candidate removes file, parsed data and embeddings.
     Strip protected characteristics (age, gender, religion, nationality, marital status, photo) before
     embedding and scoring.
Done when: uploading 100 sample resumes yields 100 searchable profiles (minus flagged
failures/duplicates), and a second user's workspace cannot see any of them.
4. Milestone B: Job Sources
A job in Vouch has a source_type : employer_posted , api_feed , csv_import , pasted ,
email_forwarded (later).

Company is optional. Display rule: show company name if known; otherwise show "Hiring directly"
plus the contact method. Required fields: title, description summary, and at least ONE of: apply
email, apply phone, apply URL. Keep location, skills, experience, salary optional.
Connectors (build as a plugin-style interface so adding one is a small change):
  1. Paste / URL-text → structured job (already built for v1.0; make it available to every recruiter,
     with a review screen).
  2. CSV/spreadsheet import with a column-mapping step.
  3. Official job APIs / feeds. Start with one or two that have clear public terms (for example job
     aggregator APIs and the public job-board endpoints of applicant tracking systems such as
     Greenhouse and Lever). Before building each connector, check that provider's current terms
     and record the decision in docs/decisions.md .
  4. Never scrape LinkedIn, Indeed or similar sites. No headless-browser scraping, no
     workarounds if blocked.
Source and company are both OPTIONAL (owner decision). Jobs from any platform or person are
welcome. If the source is unknown, show "Source: not specified" and keep the job. Never block a job
for lacking a source or company name. The only required things are a title and one way to apply.
Apply methods (any one is enough): apply link (opens the employer's own page), email, phone, or
WhatsApp ("Apply via WhatsApp"). For WhatsApp/phone, show a click-to-chat button and mask the
number in the page text where practical. Store only contacts that were published as the apply
contact.
Company career-page feeds (automatic fetching):
     A recruiter or admin adds a company by its careers URL or ATS board name. Vouch fetches that
     company's open jobs on a schedule (daily) and lists them.
     Use public, intended-for-reuse sources first: ATS public job APIs (Greenhouse, Lever, Ashby,
     SmartRecruiters, Workable), then the page's schema.org/JobPosting structured data and job
     sitemaps.
     For plain career pages, check robots.txt and the site's terms before fetching, fetch politely
     (low rate, identify the bot, cache), and skip any site that disallows it. Record each decision in
      docs/decisions.md .
     The Apply button always goes to the company's own apply page. Vouch never applies on the
     candidate's behalf for these jobs.
     Re-check each fetched job on every run. If it disappears from the company's page, mark it
     closed. Deduplicate against jobs already listed.
     Jobs from a connected feed are labeled "From [company] careers page".
Rules for every imported job:
     Store a structured summary in our own words plus the apply link, not a verbatim copy of the
     full text. Keep the source name and link when known.
     Label the source on screen ("Sourced from X") when known; otherwise "Source: not specified".
     Auto-expire (default 30 days) with a "still open?" refresh; duplicate detection.
     Takedown flow: any company can request removal; honored promptly; logged.
     Avoid storing an individual recruiter's personal email/phone unless it was published as the
     apply contact. Company-style addresses (jobs@, careers@, hr@) are fine.
Done when: a recruiter can add a job through paste, CSV, and at least one API connector, and none of
them requires a company name.
5. Milestone C: Match the pool to jobs, then reach out
Matching: reuse the v1.0 pipeline (hard filters, vector similarity, skill overlap, optional LLM
explanation). Input is the recruiter's workspace pool. On a new job: show "Top matches from your
pool" with score and a one-line reason. Also support the reverse: open a candidate and see "Best jobs
for this person".
Outreach (recruiter-initiated only):
     The recruiter selects candidates and clicks "Send this opportunity". The recruiter sees a
     preview.
     The message contains the job summary, the apply method (the employer's email/phone/link,
     or "reply to the recruiter"), and the recruiter's name and workspace.
     Every email has an unsubscribe link and a clear statement of who sent it and why. One click
     puts the address on a global suppression list, and no workspace can email it again.
     Respect do_not_contact and the suppression list in code (not only in the UI). Add tests.
     Rate limits: per-recruiter daily send cap (low by default, e.g. 50/day), and a per-address cap (e.g.
     no more than 1 email per 7 days from all of Vouch).
     Sending is behind an explicit checkbox where the recruiter confirms they have a lawful basis to
     contact these people (for example they received the resume from the candidate). Store that
     confirmation in the audit log.
     Sender domain: use a properly authenticated sending domain (SPF, DKIM, DMARC). Warm up
     slowly. Monitor bounces and spam complaints and auto-pause a workspace whose complaint
     rate is high.
     Alternative path with no email at all: "Copy message" / "Export contact + job" so the recruiter
     can contact candidates through their own channels.
Note for the owner: laws on emailing people from collected resumes vary by country. These
safeguards reduce risk but do not remove it. Get a qualified person to review before sending at scale.
Done when: from a job, a recruiter can select 5 matched pool candidates, send the opportunity, and
an unsubscribed address can no longer be emailed by anyone.
6. Growth scenarios (build the hooks, not everything at once)
Product owner asked for a scenario where the product can grow. Implement these in order:
  1. Workspace as the paid product. Free: small pool and few sends. Paid tiers by pool size,
     monthly sends, and number of connected sources. (Billing itself can wait. Build the limits and
     usage counters now so pricing is easy later.)
  2. Public job pages. Each active job gets a shareable, search-engine-friendly page (title, location,
     skills, how to apply, "Sourced from X" label if sourced). Recruiters can share links on
     WhatsApp/LinkedIn. This brings candidates in without paying for ads. Include a "Get matched
     to jobs like this" signup.
  3. Candidate pull-in. When a recruiter sends an opportunity, the email offers the candidate a free
     Vouch profile (claim) for future matches. A claimed candidate then appears in the marketplace
     only with their own consent (v1.0 rules apply).
  4. Recruiter-to-recruiter network (later). Recruiters can opt to share a job or an interview-vetted
     candidate (v1.0 redistribution loop) with other recruiters.
  5. Agencies and freelancers. Multi-user workspaces with roles, so a small agency can use one
     pool.
7. Revised build order
  1. A1 Workspaces + membership + RLS (extend existing schema).
  2. A2 Bulk upload + queue + parse + dedupe + pool search.
  3. B1 Optional-company jobs, contact-method validation, source labeling, expiry.
  4. B2 CSV import, then one official API connector.
  5. C1 Pool-vs-job matching view and reverse view.
  6. C2 Outreach with suppression list, rate limits, audit.
  7. G1 Public job pages, usage counters and limits.
  8. Everything else from v1.0 that is not yet done (feedback loop, admin panel, privacy tools).
7b. Roles recap (owner confirmed)
     Recruiter: logs in, sees only their own workspace (jobs, pool, matches). Bulk-uploads resumes
     for matching.
     Candidate: signs up, uploads a resume, searches and filters jobs, gets matches, applies via the
     job's apply method.
     Public visitor: browses and searches all jobs without logging in.
7c. Public access and discoverability (v1.0 launch requirement)
Principle: browsing is open. Login is asked only when the visitor wants something personal. The
goal is to attract attention (search engines, shared links) while protecting private data.
Public, no login needed:
     Home page with live job listings (real counts computed from the database, never hardcoded).
     Full job search and filters (keyword, location, work mode, job type, date posted) across ALL
     listed jobs. No page limits or "log in to see more".
     Individual job pages at stable, readable URLs (e.g. /jobs/social-media-marketer-lahore-
     4821 ).
     Company pages (when a company is known) listing its open jobs.
     Category and location landing pages (e.g. /jobs/marketing/karachi ) generated from real
     data. Only generate a page when it has at least a few jobs.
     Static pages: About, How matching works, Terms, Privacy, Request removal, For recruiters.
Needs login (ask at the moment of value, with a clear reason):
     Match score and "jobs for you" (needs a resume)
     Save a job, set job alerts
     Apply through Vouch on an employer-posted job
     Recruiter workspace: Talent Pool, bulk upload, outreach
     Reveal a private contact (see below)
Discoverability (SEO and sharing):
      Server-rendered job pages (not client-only), unique <title> and meta description per job,
      canonical URLs.
       JobPosting structured data (schema.org) on every job page so Google can show them in job
      search. Include validThrough so expired jobs drop out.
       sitemap.xml generated from live jobs, robots.txt , and expired jobs return a friendly
      "closed" page with similar jobs (or 410), not a 404.
      Social share previews (Open Graph / Twitter card image) per job, so shared
      WhatsApp/LinkedIn links look good.
      Share buttons: copy link, WhatsApp, LinkedIn.
      Fast pages (image optimization, caching) and mobile-first layout. Most users will be on phones.
      Landing page: label the sample match card as "Sample", and give the site a proper title and
      description.
Abuse protection (without hiding jobs):
      Rate limit job pages, search and any API by IP.
      Do not put private contacts (WhatsApp numbers, personal emails, phone numbers) in the page
      text. Show an "Apply" button; for WhatsApp/phone/email, require a free login or a simple
      human check to reveal the contact. Apply links to employer pages are shown directly.
      Do not include personal contact details in structured data or the sitemap.
      Never expose any resume, candidate or pool data publicly.
7d. Launch cut line (what must be done before the public launch)
Must have for launch: A1, A2 (workspaces and bulk upload), B1 and B2 (optional-company jobs, CSV
import, at least one company-feed/API connector), C1 (matching views), section 7c (public pages and
SEO), the privacy tools and takedown from the original v1.0 spec, and the Terms and Privacy pages.
Safer at launch: for outreach (C2), ship "Copy message" and "Export contact + job" first. Add direct
email sending right after launch once the sending domain is authenticated and warmed up, because
a new domain that sends cold email can be blocked quickly.
After launch (v1.1): direct email outreach at scale, paid plans and billing, recruiter-to-recruiter
network, agencies and multi-user roles, job alerts by email, additional connectors.
8. First thing to do in the repo
Before writing code, audit the existing app: list what screens, routes and tables exist today versus this
document, and write the gaps into docs/decisions.md . Then start with A1. Ask the owner if
anything here conflicts with what is already built.
```
