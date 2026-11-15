# HireLoop — consent-first HR matching platform

"Your resume gets matched to jobs automatically, and nothing happens without your permission."

Spec: [`docs/requirements.md`](docs/requirements.md) · Decisions: [`docs/decisions.md`](docs/decisions.md) · Agent guide: [`CLAUDE.md`](CLAUDE.md)

## What's built (M0–M10)

| Area                                                                                                                                           | Where                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Schema, RLS on every table, consent/state-machine triggers, RPCs                                                                               | `supabase/migrations/`                                                 |
| Auth (email+password, Google OAuth, verification, reset, role onboarding)                                                                      | `src/app/(auth)`, `src/middleware.ts`                                  |
| Candidate: resume upload → AI parse → review/edit, preferences, visibility, block list, approve/decline, redistribution opt-in, export, delete | `src/app/candidate`                                                    |
| Recruiter: company + seats, paste-to-structure job posting, pipeline with filters, interview-vetted candidates, stages, feedback               | `src/app/recruiter`                                                    |
| Matching engine (hard filters → pgvector → skill overlap → combined score → optional LLM re-rank → threshold)                                  | `src/lib/matching`                                                     |
| Notify/approve/apply: signed expiring tokens, digest emails, weekly cap, retries, delivery webhooks, unsubscribe                               | `src/lib/email`, `src/lib/consent`, `src/app/m`, `src/app/unsubscribe` |
| Sourced jobs (admin paste only), labeling, 30-day expiry, duplicate detection, takedowns                                                       | `src/app/admin`, `src/app/takedown`                                    |
| Admin: counts, users, moderation, audit log, logged access to private feedback                                                                 | `src/app/admin`                                                        |
| Cron: expiry + catch-up matching + notifications                                                                                               | `src/app/api/cron/run`, `vercel.json`                                  |

Not built (per spec "NOT in MVP"): SMS, messaging, auto-approve, payments, scraping, bulk import UI, mobile, analytics, i18n.

## Local setup

Requirements: Node 20+, Docker (for the Supabase local stack).

```bash
npm ci
```

```bash
npx supabase start
```

Copy `.env.example` to `.env.local` and fill in the values printed by `supabase start` (API URL, anon key, service-role
key, DB URL), plus `TOKEN_SIGNING_SECRET`, `CRON_SECRET`, `CONSENT_HASH_SALT`. `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY` and
`RESEND_API_KEY` are optional locally: without them parsing falls back to manual entry, embeddings use the deterministic
local embedder, and emails are printed to the server console.

```bash
npm run dev
```

Seeded accounts (password `Password123!`): `admin@example.test`, recruiters `rita@acme.example.test`,
`gary@globex.example.test`, `ivy@initech.example.test`, candidates `maya@example.test`, `jordan@example.test`, … (see
`supabase/seed.sql`). Run `npm run matching:run` then `npm run notify:run` to generate matches for the seed data.

## Tests

- `npm test` — unit, matching, email and DB suites (RLS, consent, redistribution/privacy, export/erasure). DB suites
  run on plain Postgres 16 + pgvector at `LOCAL_PG_ADMIN_URL` using `supabase/test-shim` to emulate Supabase roles,
  `auth.uid()` and storage; each test file gets a fresh database.
- `npm run test:e2e` — Playwright against the running app + local Supabase (`npx supabase db reset` first for a clean
  run). Covers the happy path (recruiter posts → candidate matched → approves → recruiter sees applicant), role guards,
  sourced labeling, resume upload fallback, email-link decline, sourced duplicate detection and takedown.

## Deploying

1. Create a Supabase project; enable the `vector` and `pg_trgm` extensions; `supabase link` then `npm run db:migrate`.
   Configure Auth: email confirmations on, Google provider, site URL + `/auth/callback` redirect.
2. Vercel project with the env vars from `.env.example` (use the Supavisor pooled URL for `DATABASE_URL`).
   `vercel.json` runs `/api/cron/run` once a day (Hobby plan limit). On Vercel Pro, change it to `*/10 * * * *`; matching and emails also run right after each relevant action, so daily is enough to start.
3. Resend: verify the sending domain; add a webhook to `/api/webhooks/resend` and set `RESEND_WEBHOOK_SECRET`.
4. Promote an admin: `update public.users set role = 'admin' where email = '…';` (SQL editor; never via the API).

Before launch: have the draft `/terms` and `/privacy` reviewed by a qualified person.
