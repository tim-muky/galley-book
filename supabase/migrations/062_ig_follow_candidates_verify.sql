-- Handle-quality fields for the IG follow queue (GAL-455 follow-up). The seed
-- list was AI-researched and ~23% of handles were flagged "uncertain", so some
-- point at the wrong account. Add a verify flag (badge unverified rows in the
-- UI) and an 'invalid' status so confirmed-wrong handles can be flagged
-- distinctly from a deliberate skip.
alter table public.ig_follow_candidates
  add column if not exists needs_verify boolean not null default false;

alter table public.ig_follow_candidates drop constraint if exists ig_follow_candidates_status_check;
alter table public.ig_follow_candidates add constraint ig_follow_candidates_status_check
  check (status in ('suggested', 'followed', 'skipped', 'invalid'));
