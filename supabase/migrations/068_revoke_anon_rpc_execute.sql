-- Close the unauthenticated write vector on two SECURITY DEFINER RPCs.
--
-- `create_galley` and `seed_default_recipes` bypass RLS by design, take the
-- target owner / galley as plain arguments, and carried no internal auth check.
-- Both were executable by `anon` — and the anon key ships publicly in the web
-- bundle and the native app — so anyone could:
--   * create_galley(name, <any uuid>)        → a galley owned by an arbitrary
--     user, plus a galley_members row, i.e. it shows up in that user's library
--   * seed_default_recipes(<any galley>, …)  → write recipes into any galley
--
-- Note the grant did NOT come from a migration: 031/038/063 all granted only to
-- `authenticated, service_role`. It comes from Supabase's default privileges on
-- schema public, which grant EXECUTE on new functions to anon as well. Any
-- future SECURITY DEFINER function will inherit the same exposure unless it is
-- revoked explicitly — see the note at the bottom of this file.
--
-- Callers verified before revoking:
--   create_galley        → app/api/galleys/route.ts (session client, owner =
--                          user.id) and app/admin/import-test/page.tsx (ditto).
--                          No trigger calls it: handle_new_user inlines its own
--                          galley insert.
--   seed_default_recipes → no application caller at all. Only the
--                          handle_new_user trigger (via `perform`) and the 031
--                          backfill, both of which run as the definer and so
--                          are unaffected by these grants.

-- ----------------------------------------------------------------------
-- 1. create_galley — authenticated users only, and only for themselves.
-- ----------------------------------------------------------------------

revoke execute on function public.create_galley(text, uuid) from public, anon;

-- Defence in depth: even an authenticated caller must not be able to forge a
-- galley owned by someone else. Both real callers already pass their own
-- user.id, so this changes no legitimate behaviour. Signature is unchanged, so
-- CREATE OR REPLACE is safe here (no drop-then-create needed).
create or replace function public.create_galley(galley_name text, owner uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_galley_id uuid;
begin
  -- auth.uid() is null for service_role and for internal definer calls; those
  -- are trusted. Reject only a signed-in user naming someone else as owner.
  if auth.uid() is not null and auth.uid() <> owner then
    raise exception 'create_galley: cannot create a galley owned by another user'
      using errcode = '42501';
  end if;

  insert into public.galleys (name, owner_id)
  values (galley_name, owner)
  returning id into new_galley_id;

  insert into public.galley_members (galley_id, user_id, role, joined_at)
  values (new_galley_id, owner, 'owner', now());

  return new_galley_id;
end;
$function$;

-- CREATE OR REPLACE resets the ACL to the default, so re-apply the intended
-- grants after redefining.
revoke execute on function public.create_galley(text, uuid) from public, anon;
grant execute on function public.create_galley(text, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------
-- 2. seed_default_recipes — no client should ever call this directly.
-- ----------------------------------------------------------------------
-- It is reachable only from the signup trigger and the 031 backfill, both of
-- which execute as the function owner. `authenticated` is revoked too: an
-- auth.uid() guard is NOT an option here, because during signup the trigger
-- runs with a null auth.uid() and a guard would silently break first-galley
-- seeding for every new user.

revoke execute on function public.seed_default_recipes(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.seed_default_recipes(uuid, uuid) to service_role;

-- ----------------------------------------------------------------------
-- 3. Stop the bleeding for future functions.
-- ----------------------------------------------------------------------
-- Supabase's default privileges hand `anon` EXECUTE on every new function in
-- public. Narrow that default so a new SECURITY DEFINER helper is not exposed
-- to unauthenticated callers the moment it is created. Existing functions are
-- unaffected by this statement — it only governs functions created from here on
-- by the roles listed.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
