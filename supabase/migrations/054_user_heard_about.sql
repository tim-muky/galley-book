-- 054 — self-reported acquisition source ("where did you hear about us?").
--
-- App-install conversions can never carry the web first-touch UTM cookie
-- (gb_attr lives on .galleybook.com; native signups happen inside the app),
-- so iOS/Android installs were all classified "direct". This column captures
-- a one-tap self-reported source on the native onboarding (IntroScreen) to
-- recover the organic/word-of-mouth/social split that paid-ad dashboards
-- (Apple Search Ads) cannot see. Complementary to utm_* from migration 048.
--
-- First-touch: written once, never overwritten (the client guards on null).

alter table public.users
  add column if not exists heard_about text;

comment on column public.users.heard_about is
  'Self-reported acquisition source from native onboarding (instagram, tiktok, friend, appstore, google, other). First-touch; complements first-party utm_* from migration 048.';
