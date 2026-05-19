-- GAL-329: device registry for push notifications + per-user opt-out preferences.
--
-- Native (Expo) clients register their Expo push token here on app launch
-- and after sign-in. Send-helpers fan out to all tokens for a given
-- user_id (so a user with iPhone + iPad gets both). We use Expo's push
-- service rather than direct APNs for v1 because EAS already manages
-- the APNs key and Expo's API is one HTTP POST instead of HTTP/2 +
-- JWT-signed APNs auth.
--
-- Notification preferences live on a separate table so adding a new
-- event type doesn't require an auth.users migration. Free-form jsonb
-- gives us room to grow without follow-up DDL.

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists user_devices_token_unique
  on public.user_devices(expo_push_token);

create index if not exists user_devices_user_idx
  on public.user_devices(user_id);

alter table public.user_devices enable row level security;

-- A user can only see / manage their own devices.
create policy "user_devices_select_own"
  on public.user_devices for select
  using (auth.uid() = user_id);

create policy "user_devices_insert_own"
  on public.user_devices for insert
  with check (auth.uid() = user_id);

create policy "user_devices_update_own"
  on public.user_devices for update
  using (auth.uid() = user_id);

create policy "user_devices_delete_own"
  on public.user_devices for delete
  using (auth.uid() = user_id);

-- Per-user notification preferences. Keys are event-type identifiers
-- (e.g. "recipe_added", "cook_next_added", "cook_next_cleared",
-- "admin_announcement"). Missing key → default to enabled. Explicit
-- false → muted.
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "notification_preferences_select_own"
  on public.notification_preferences for select
  using (auth.uid() = user_id);

create policy "notification_preferences_upsert_own"
  on public.notification_preferences for insert
  with check (auth.uid() = user_id);

create policy "notification_preferences_update_own"
  on public.notification_preferences for update
  using (auth.uid() = user_id);
