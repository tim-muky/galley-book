-- Growth Intelligence: daily report snapshots (GAL-422 / GAL-423).
-- One row per day. Written by the daily cron via the service role (bypasses RLS);
-- read by admins in the dashboard. report_date is the PK so re-running a day
-- upserts instead of duplicating.

create table if not exists public.growth_daily_reports (
  report_date   date primary key,
  generated_at  timestamptz not null default now(),
  -- totals + per-channel breakdown + computed KPIs (new users, spend, CPS, …)
  metrics       jsonb not null,
  -- per-ad/creative rows (spend, clicks, meta signups, cps, attributed new users)
  per_creative  jsonb not null default '[]'::jsonb,
  -- AI narrative + ranked recommendations (GAL-426); null until analysis runs
  analysis      jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists growth_daily_reports_generated_at_idx
  on public.growth_daily_reports (generated_at desc);

alter table public.growth_daily_reports enable row level security;

-- Admins can read reports in the dashboard. Inserts/updates go through the
-- service role (cron), which bypasses RLS — no write policy for end users.
create policy "Admins read growth reports"
  on public.growth_daily_reports for select
  using ((select is_admin from public.users where id = auth.uid()) = true);
