-- 067 — store the galleybook Instagram (Instagram Login) OAuth connection created
-- via the admin "Connect Instagram" flow (Admin → Social Media).
--
-- The comment → DM automation (066) sends private replies through the Instagram
-- API with Instagram Login, which needs an *Instagram User* access token (not the
-- Facebook Page token used for carousel publishing). First-party, single account,
-- so a singleton row (id = 1). Instagram long-lived tokens last ~60 days and are
-- refreshed in place (ig_refresh_token) — getInstagramUserToken() reads this row
-- and refreshes when near expiry.
--
-- Holds an OAuth secret: admin-only, read/written via the service-role client
-- (bypasses RLS). RLS on with NO policies so the token is never exposed via the
-- Data API.
create table if not exists public.instagram_oauth (
  id                smallint primary key default 1 check (id = 1),
  ig_user_id        text,
  username          text,
  scope             text,
  access_token      text not null,
  token_expires_at  timestamptz,
  connected_by      uuid references public.users(id),
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.instagram_oauth enable row level security;
