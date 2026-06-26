-- GAL-483: first-party landing/site pageview log.
-- Vercel Web Analytics has no query API (dashboard + manual CSV export only), so
-- we log our own anonymous pageviews to power the daily growth report + the admin
-- dashboard. No PII: no IP, no persistent identifier. `country` is the coarse
-- edge geo (x-vercel-ip-country); `session_id` is an ephemeral client
-- sessionStorage id (cleared on tab close) for rough unique-session counting.
-- Inserts go through the service role (POST /api/track/pageview); admins read.

create table if not exists public.page_views (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  path          text not null,
  referrer_host text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  country       text,
  session_id    text
);

create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
create index if not exists page_views_path_idx on public.page_views (path);

alter table public.page_views enable row level security;

-- No public insert policy: writes come from the service-role endpoint only.
-- Admins may read directly (the dashboard itself reads via the service role).
create policy "Admins read page_views"
  on public.page_views for select
  using ((select is_admin from public.users where id = auth.uid()) = true);
