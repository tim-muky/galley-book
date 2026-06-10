-- Android isn't on the Play Store yet — it's in closed testing (see GAL-275 /
-- GAL-77). Landing-page visitors on Android can either leave their email to be
-- notified at public launch, or jump straight into the closed-testing flow.
--
-- This table backs the "notify me at launch" capture. The caller is
-- unauthenticated (pre-signup), so the POST /api/android-waitlist route writes
-- via the service role. RLS is enabled with no public policy; explicit grants
-- are declared per the 2026-10-30 Data API requirement for new public tables.

create table if not exists public.android_waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  locale      text,
  source      text not null default 'landing-android',
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table public.android_waitlist enable row level security;
-- No policies: clients get nothing directly; the service role (the insert route
-- and any admin read) bypasses RLS.

grant all on public.android_waitlist to service_role;
