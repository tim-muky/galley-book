-- GAL-446: store the galleybook TikTok OAuth connection created via the admin
-- "Connect TikTok" flow (Admin → Social Media). First-party, single account, so
-- a singleton row (id = 1). Holds the long-lived refresh token; getTikTokAccessToken()
-- reads this first and mints a fresh access token per publish, rotating the stored
-- refresh token, and falls back to the TIKTOK_* env vars when no row is present.
create table if not exists public.tiktok_oauth (
  id                        smallint primary key default 1 check (id = 1),
  open_id                   text,
  display_name              text,
  scope                     text,
  access_token              text not null,
  refresh_token             text not null,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  connected_by              uuid references public.users(id),
  connected_at              timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Holds OAuth secrets: admin-only, read/written via the service-role client
-- (bypasses RLS). Enable RLS with NO policies so the tokens are never exposed
-- through the Data API.
alter table public.tiktok_oauth enable row level security;
