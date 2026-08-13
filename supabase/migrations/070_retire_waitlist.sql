-- Retire the waitlist tables, and tidy one leftover grant.
--
-- ---------------------------------------------------------------------------
-- 1. waitlist / android_waitlist
-- ---------------------------------------------------------------------------
-- Neither table has a live producer any more. Signup goes landing → Google
-- OAuth directly, and Android has been publicly launched on Google Play since
-- 2026-07-16 (GAL-443 / GAL-484), which is what the Android interstitial existed
-- to bridge.
--
-- Contents checked before dropping, rather than assumed:
--   android_waitlist  0 rows       — GAL-484's "email the waitlist signups"
--                                    launch step had nobody to email
--   waitlist          2 rows       — both the owner's own addresses, from
--                                    April 2026; test signups, no real users
--
-- Both also showed up in the security advisor as rls_enabled_no_policy. Dropping
-- them removes the finding rather than papering over it with a deny policy for a
-- table nothing writes to.
--
-- The only writer was app/api/android-waitlist/route.ts, deleted in the same
-- commit. /landing/android stays — it redirects to the Play listing so old links
-- and printed QR codes keep resolving.

drop table if exists public.android_waitlist;
drop table if exists public.waitlist;

-- ---------------------------------------------------------------------------
-- 2. create_recipe_with_children — drop the anon grant
-- ---------------------------------------------------------------------------
-- Not a vulnerability: unlike the functions revoked in 068, this one is
-- SECURITY INVOKER, so RLS is enforced against the caller and an anonymous
-- insert into public.recipes is rejected regardless. It fell outside 068's scope
-- for exactly that reason.
--
-- It is still an unnecessary grant — the only legitimate caller is
-- POST /api/recipes, which always runs with a user session. Revoke it so the
-- privilege matches the actual access pattern and stops showing up in audits.

-- Revoke from PUBLIC, not just anon. Postgres grants EXECUTE to PUBLIC by
-- default, and that implicit grant is what actually makes the function reachable
-- by anon — dropping the explicit `anon=X` entry alone leaves `=X/postgres` in
-- the ACL and has_function_privilege('anon', …) still returns true. Same
-- treatment as 068, which got this right.
--
-- Revoking PUBLIC does not touch the explicit authenticated/service_role
-- entries, but re-granting keeps the intent readable and makes the migration
-- idempotent if it is ever replayed against a fresh database.
revoke execute on function
  public.create_recipe_with_children(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function
  public.create_recipe_with_children(jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;
