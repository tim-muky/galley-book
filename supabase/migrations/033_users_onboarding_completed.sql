-- 033_users_onboarding_completed
--
-- Server-side source of truth for "has this user completed onboarding".
--
-- The native client previously used a per-user SecureStore flag
-- (lib/introFlag.ts, GAL-279) to gate the IntroScreen. That flag is
-- isolated by user id, so multi-user-on-same-device works — but it's
-- still local storage, and Tim observed the IntroScreen being skipped
-- for a freshly-created account (GAL-289). SecureStore-backed Keychain
-- entries can persist across app reinstalls and don't survive a switch
-- to a different device, so any flag-only-on-device approach is
-- fragile.
--
-- Adding a boolean on public.users gives both clients a single source
-- of truth. Existing users have already used the app — backfill them
-- to true so they don't see onboarding again. New users default to
-- false and see the flow.
--
-- The existing "Users can update own profile" RLS policy already
-- allows authenticated users to flip this column for their own row,
-- so no new policy is needed.

alter table public.users
  add column onboarding_completed boolean not null default false;

update public.users set onboarding_completed = true;
