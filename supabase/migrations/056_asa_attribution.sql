-- GAL-439: deterministic per-user Apple Search Ads attribution.
--
-- The native app fetches an AdServices attribution token on first launch and
-- POSTs it to /api/attribution/adservices, which resolves it against Apple's
-- AdServices API and writes the result here. This complements the web-only
-- first-touch UTM columns from 048 (which an iOS-install user never carries,
-- since the gb_attr cookie lives on the web domain — see project_attribution_break).
--
-- First-touch: once asa_captured_at is set it's never overwritten. Organic
-- installs (Apple returns attribution:false) still stamp asa_captured_at so the
-- client stops retrying — asa_attributed records whether it was an actual ad tap.

alter table public.users
  add column if not exists asa_attributed         boolean,
  add column if not exists asa_campaign_id        bigint,
  add column if not exists asa_keyword_id         bigint,
  add column if not exists asa_ad_group_id        bigint,
  add column if not exists asa_ad_id              bigint,
  add column if not exists asa_org_id             bigint,
  add column if not exists asa_conversion_type    text,
  add column if not exists asa_click_date         timestamptz,
  add column if not exists asa_country_or_region  text,
  add column if not exists asa_raw                jsonb,
  add column if not exists asa_captured_at        timestamptz;

-- Dashboard groups installs by ASA campaign/keyword (mirrors 048's UTM indexes).
create index if not exists users_asa_campaign_idx on public.users (asa_campaign_id);
create index if not exists users_asa_keyword_idx on public.users (asa_keyword_id);
