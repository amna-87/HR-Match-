-- Search feeds from free job APIs (D-039): Remotive, Remote OK, Arbeitnow
-- (no key) and Jooble, Careerjet (partner keys). A search feed stores
-- "keywords|location" in board.
alter table public.job_feeds drop constraint job_feeds_provider_check;
alter table public.job_feeds add constraint job_feeds_provider_check
  check (provider in ('greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'recruitee',
                      'remotive', 'remoteok', 'arbeitnow', 'jooble', 'careerjet'));
alter table public.job_feeds drop constraint job_feeds_board_check;
alter table public.job_feeds add constraint job_feeds_board_check
  check (board ~ '^[A-Za-z0-9._-]{1,100}$'
         or (provider in ('remotive', 'remoteok', 'arbeitnow', 'jooble', 'careerjet')
             and length(board) between 1 and 170 and board ~ '^[^\n\r]*\|[^\n\r|]*$'));
