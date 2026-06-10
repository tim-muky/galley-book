-- GAL-444: Android Play Install Referrer attribution.
--
-- The native Play Install Referrer API hands back the `referrer` string from
-- the Play Store link that drove the install (UTM-tagged links carry
-- utm_source/medium/campaign/...). /api/attribution/play-referrer parses those
-- into the EXISTING first-touch utm_* columns (migration 048) so Android
-- installs feed the same attribution dashboard as web — no new dashboard work.
--
-- These columns only store the raw referrer + Play timestamps for audit; the
-- parsed UTM lands in the shared utm_* columns under the same
-- attribution_captured_at first-touch guard.

alter table public.users
  add column if not exists play_install_referrer  text,
  add column if not exists play_referrer_click_at timestamptz,
  add column if not exists play_install_begin_at  timestamptz;
