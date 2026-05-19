-- GAL-345: migration 041 introduced an RLS chain that Postgres flags as
-- "infinite recursion detected in policy for relation 'galleys'". Two
-- paths trigger it:
--   1. recipes SELECT policy did EXISTS (SELECT FROM galleys ...). That
--      sub-select fires galleys RLS, which references galley_followers,
--      which has policies that reference galleys → loop.
--   2. galleys SELECT policy did EXISTS (SELECT FROM galley_followers ...)
--      inline — same loop.
--
-- The user-visible symptom: every authenticated read on recipes returned
-- an error so the iOS app showed empty galleys for everyone.
--
-- Fix: use a SECURITY DEFINER helper to check is_public, mirroring the
-- existing is_galley_member() helper pattern. Helpers bypass RLS, so the
-- subquery doesn't re-enter the policy tree.

create or replace function public.is_galley_public(galley_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_public from public.galleys where id = galley_uuid), false);
$$;

grant execute on function public.is_galley_public(uuid) to authenticated, service_role, anon;

-- Replace the galleys SELECT policy: no EXISTS over galley_followers any
-- more. is_public being true is enough to grant SELECT — a non-following
-- user needs to preview the galley before they can follow it anyway.
drop policy if exists "Galley members or followers can read galley" on public.galleys;
drop policy if exists "Galley members or public viewers can read galley" on public.galleys;
create policy "Galley members or public can read galley"
  on public.galleys for select
  using (
    is_galley_member(id)
    or is_public = true
  );

-- Replace the recipes SELECT policy to use is_galley_public instead of
-- the EXISTS subquery, AND use the existing is_galley_member helper for
-- consistency.
drop policy if exists "Galley members or public viewers can read recipes" on public.recipes;
create policy "Galley members or public viewers can read recipes"
  on public.recipes for select
  using (
    is_galley_member(galley_id)
    or share_token is not null
    or is_galley_public(galley_id)
  );

-- galley_followers INSERT policy also queried galleys inline — same
-- recursion potential. Swap in is_galley_public.
drop policy if exists "galley_followers_insert_own" on public.galley_followers;
create policy "galley_followers_insert_own"
  on public.galley_followers for insert
  with check (
    auth.uid() = user_id
    and is_galley_public(galley_id)
  );
