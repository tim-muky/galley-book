-- Facebook Page distribution columns on galley_distributions (GAL-453).
-- Reuses the existing ig_post_status enum (pending | published | failed),
-- exactly like the TikTok columns (057_tiktok_distribution.sql).
alter table public.galley_distributions
  add column if not exists fb_post_id text,
  add column if not exists fb_status public.ig_post_status not null default 'pending',
  add column if not exists fb_error text;
