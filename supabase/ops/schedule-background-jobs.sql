-- Run Vouch's background tick (expire stale matches/jobs, catch-up matching,
-- send pending match emails) every 10 minutes using Supabase's own scheduler.
-- Use this on the Vercel Hobby plan, whose built-in cron only runs once a day.
--
-- HOW TO USE (Supabase dashboard -> SQL Editor -> New query):
--   1. Replace the two placeholders below:
--        YOUR_CRON_SECRET  -> exactly the CRON_SECRET value you set in Vercel
--        YOUR_APP_URL      -> e.g. https://hr-match-gamma.vercel.app  (no trailing slash)
--   2. Run the whole script once.
-- The secret is stored in Supabase Vault (encrypted), not in this file or in git.
-- NOT a migration on purpose: it contains your secret and is specific to one environment.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- (re)store the two values in Vault
delete from vault.secrets where name in ('vouch_cron_secret', 'vouch_app_url');
select vault.create_secret('YOUR_CRON_SECRET', 'vouch_cron_secret');
select vault.create_secret('YOUR_APP_URL', 'vouch_app_url');

-- (re)create the schedule
select cron.unschedule(jobid) from cron.job where jobname = 'vouch-background-tick';
select cron.schedule(
  'vouch-background-tick',
  '*/10 * * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'vouch_app_url') || '/api/cron/run',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vouch_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

-- Check it: after ~10 minutes, recent runs and HTTP results should appear here.
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select status_code, created from net._http_response order by created desc limit 5;   -- expect 200
-- To stop it:
--   select cron.unschedule('vouch-background-tick');
