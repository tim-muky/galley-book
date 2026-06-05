-- Repo-sync migration (2026-06-05).
--
-- GAL-427 and GAL-430 were applied directly to the production database (migration
-- history entries `growth_daily_reports_auto_actions` and `growth_learning_loop`)
-- but their .sql files were never committed, so the repo could not reproduce prod
-- on a fresh environment. This file captures those objects faithfully from the
-- live schema. It is idempotent (if-not-exists / add-column-if-not-exists): a no-op
-- against production (objects already exist), and reproduces them for fresh setups.

-- GAL-427: auto-pause guardrail actions recorded on the daily report.
alter table public.growth_daily_reports
  add column if not exists auto_actions jsonb not null default '[]'::jsonb;

-- GAL-430: per-creative attribute tags for the paid learning loop, keyed by the
-- Meta ad id. Written by tagPushedCreatives() via the service role. RLS on, no
-- client policies (service-role only); no FK constraints in prod.
create table if not exists public.creative_attributes (
  ad_id           text primary key,
  distribution_id uuid,
  galley_id       uuid,
  angle           text,
  media_format    text,
  theme           text,
  hook_type       text,
  cta             text,
  language        text,
  placement       text,
  headline        text,
  primary_text    text,
  created_at      timestamptz not null default now()
);
alter table public.creative_attributes enable row level security;
grant all on public.creative_attributes to service_role;

-- GAL-430: derived learnings knowledge base (one row per dimension+value).
create table if not exists public.growth_learnings (
  id             uuid primary key default gen_random_uuid(),
  dimension      text not null,
  value          text not null,
  statement      text not null,
  evidence       jsonb not null default '{}'::jsonb,
  sample_size    integer not null default 0,
  confidence     text not null default 'low',
  status         text not null default 'active',
  first_observed date,
  last_updated   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (dimension, value)
);
alter table public.growth_learnings enable row level security;
grant all on public.growth_learnings to service_role;
