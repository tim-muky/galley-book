-- 055 — idempotency log for the 3-day trial-nudge sequence.
--
-- Every new signup gets 3 days of full premium (lib/iap/entitlement.ts). The
-- trial-nudges cron (app/api/cron/trial-nudges) fans out push/email touches
-- during that window. This table records which nudge each user has already
-- received so re-running the cron (twice daily) never double-sends.
--
-- Service-role only: written exclusively by the cron via the service client,
-- which bypasses RLS. No client/anon access — RLS on, no policies.

create table if not exists public.trial_nudge_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nudge_key text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, nudge_key)
);

create index if not exists trial_nudge_log_user_idx
  on public.trial_nudge_log (user_id);

alter table public.trial_nudge_log enable row level security;
