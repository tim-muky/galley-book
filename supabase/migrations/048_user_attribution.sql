-- GAL-393 prerequisite: first-touch signup attribution.
-- Ads drive to galleybook.com (UTM params), the user clicks through to
-- app.galleybook.com and signs in with Google. We capture the UTM into a
-- first-party cookie scoped to .galleybook.com on the landing page (consent-
-- gated), then persist it onto the user row in the auth callback.
--
-- First-touch: once attribution_captured_at is set it's never overwritten.

alter table public.users
  add column if not exists utm_source             text,
  add column if not exists utm_medium             text,
  add column if not exists utm_campaign           text,
  add column if not exists utm_content            text,
  add column if not exists utm_term               text,
  add column if not exists ref_referrer           text,
  add column if not exists ref_landing_path       text,
  add column if not exists attribution_captured_at timestamptz;

-- Dashboard groups signups by campaign/source (GAL-393).
create index if not exists users_utm_campaign_idx on public.users (utm_campaign);
create index if not exists users_utm_source_idx on public.users (utm_source);
