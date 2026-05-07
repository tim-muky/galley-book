-- 032_user_fk_cascade_fixups_v2
--
-- Follow-up to migration 021. Account deletion (DELETE /api/account)
-- still failed with HTTP 500 "Database error deleting user" on older
-- accounts because three FKs added AFTER 021 were left at the default
-- NO ACTION:
--
--   * parse_quality_logs.user_id  -> auth.users(id)   (added in 027)
--   * iap_subscriptions.granted_by -> public.users(id) (added in 028)
--   * iap_subscriptions.revoked_by -> public.users(id) (added in 028)
--
-- The delete-account route relies on auth.users -> public.users CASCADE
-- to clean up dependent rows, so any FK pointing at either users table
-- with NO ACTION blocks the cascade. Older accounts had accumulated
-- parse_quality_logs rows; freshly created accounts had none, which is
-- why the bug only reproduced on older accounts.
--
-- All three columns are already nullable, so SET NULL is safe.

alter table public.parse_quality_logs
  drop constraint if exists parse_quality_logs_user_id_fkey;
alter table public.parse_quality_logs
  add constraint parse_quality_logs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.iap_subscriptions
  drop constraint if exists iap_subscriptions_granted_by_fkey;
alter table public.iap_subscriptions
  add constraint iap_subscriptions_granted_by_fkey
  foreign key (granted_by) references public.users(id) on delete set null;

alter table public.iap_subscriptions
  drop constraint if exists iap_subscriptions_revoked_by_fkey;
alter table public.iap_subscriptions
  add constraint iap_subscriptions_revoked_by_fkey
  foreign key (revoked_by) references public.users(id) on delete set null;
