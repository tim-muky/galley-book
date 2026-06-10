-- TikTok publishing state on galley_distributions (mirrors the ig_* columns).
-- Reuses the existing ig_post_status enum (pending | published | failed) since
-- the lifecycle is identical to Instagram.
alter table public.galley_distributions
  add column if not exists tiktok_post_id text,
  add column if not exists tiktok_status public.ig_post_status not null default 'pending',
  add column if not exists tiktok_error text;
