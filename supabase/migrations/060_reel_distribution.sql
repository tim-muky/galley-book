-- Reel (short video) distribution columns on galley_distributions (GAL-452).
-- The rendered MP4 path reuses the existing video_path column; these track the
-- publish state of the Instagram Reel. Reuses the ig_post_status enum, like the
-- TikTok (057) and Facebook (059) columns.
alter table public.galley_distributions
  add column if not exists reel_post_id text,
  add column if not exists reel_status public.ig_post_status not null default 'pending',
  add column if not exists reel_error text;
