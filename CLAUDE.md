# CLAUDE.md

## Project

Two-sided HR matching platform: candidates upload resumes, recruiters post jobs, the system ranks matches and asks the
candidate for permission before any application is sent.

Read `docs/requirements.md` first, then `docs/requirements-v1.0-addendum.md` (it overrides requirements.md where they
conflict; build order is its section 7, launch cut line 7d). Log any design decision you make in `docs/decisions.md`.

## Stack

Next.js (TypeScript, App Router), Tailwind + shadcn/ui-style components, Supabase (Postgres, Auth, Storage, pgvector),
Claude API for parsing, Resend for email, Zod for validation, Vitest + Playwright for tests. Hosting: Vercel + Supabase.

## Non-negotiable rules

1. Never create an application without a prior approved consent event from the candidate.
2. Never email addresses taken from resumes unless that person has claimed their profile and opted in.
3. Recruiter "growth areas" and private notes are internal only. Never expose them to candidates or other companies.
4. Sourced (external) jobs are always labeled as sourced, never auto-applied, never presented as employer-posted.
5. Never use protected characteristics (age, gender, religion, ethnicity, marital status, photo, nationality) in matching.
6. Every table has Row Level Security. Never rely on app code alone for access control.
7. Resumes live in a private bucket, accessed via short-lived signed URLs.
8. No scraping of job portals.

## Working style

- Build in thin vertical slices following the milestones (M0-M10) in the requirements doc. Finish and test one before
  starting the next.
- Write tests for RLS, consent rules, and matching alongside the code, not afterward.
- Ask before inventing behavior not covered in the spec. Prefer the safer, consent-first option.
- Never commit secrets. Use environment variables and keep `.env.example` updated.
- Keep changes small and commit often with clear messages.
- Do not build anything listed under "Explicitly NOT in MVP".

## Where things live

- `supabase/migrations/` — schema, RLS, triggers (consent rules are enforced in the DB), RPC functions.
- `supabase/test-shim/` — emulates Supabase roles/auth/storage on plain Postgres for fast DB tests. Never deploy it.
- `src/lib/matching/config.ts` — the ONE place matching weights/thresholds and notify caps live.
- `src/lib/matching/engine.ts` — matching pipeline; `src/lib/email/notifier.ts` — notify step + throttling.
- `src/lib/consent/` — signed email tokens, TS mirror of the match state machine.
- Trusted server code uses `src/lib/db` (direct Postgres, bypasses RLS). User actions use the per-request Supabase client
  (`src/lib/supabase/server.ts`) so RLS applies.

## Commands

```bash
npm run dev            # dev server (needs .env.local; see README)
npm run build          # production build
npm run lint           # eslint, zero warnings
npm run typecheck      # tsc --noEmit
npm run format         # prettier --write (format:check in CI)
npm test               # all Vitest suites (unit + DB tests on plain Postgres at LOCAL_PG_ADMIN_URL)
npm run test:db        # RLS / consent / privacy suites only
npm run test:e2e       # Playwright; needs `npx supabase start` + app running on :3000
npx supabase start     # local Supabase stack (applies migrations + seed.sql)
npx supabase db reset  # re-apply migrations + seed on the local stack
npm run db:migrate     # supabase db push (linked remote project)
npm run db:reset       # plain-Postgres test DB (shim + migrations + seed) — no Docker needed
npm run matching:run   # run the matching engine for everything flagged needs_matching
npm run notify:run     # send pending match notifications (respects throttling)
# supabase/ops/*.sql are per-environment ops scripts (contain secrets once filled in) — run by hand, never as migrations
```
