-- Pin search_path on the six functions the Supabase linter flagged as
-- `function_search_path_mutable`. Without a pinned path a caller can point
-- search_path at a schema they control and shadow the objects these functions
-- resolve — the classic SECURITY DEFINER escalation.
--
-- ALTER FUNCTION ... SET is used deliberately instead of CREATE OR REPLACE:
-- it attaches the setting without restating (and risking a transcription error
-- in) any function body.
--
-- Verified safe before applying: every body either fully schema-qualifies its
-- tables (public.galley_members, public.galleys, …) or references only objects
-- in public, and auth.uid() is explicitly qualified — so pinning to 'public'
-- preserves the resolution these functions already had.

alter function public.create_recipe_with_children(jsonb, jsonb, jsonb, jsonb) set search_path to 'public';
alter function public.prevent_system_galley_delete()  set search_path to 'public';
alter function public.prevent_system_recipe_delete()  set search_path to 'public';
alter function public.set_updated_at()                set search_path to 'public';
alter function public.is_galley_member(uuid)          set search_path to 'public';
alter function public.is_galley_owner(uuid)           set search_path to 'public';

-- ----------------------------------------------------------------------
-- Two more unauthenticated entitlement oracles.
-- ----------------------------------------------------------------------
-- Both take a caller-supplied id and return a boolean, and both were callable
-- by anon — an unauthenticated probe for "does this user/galley have premium?".
-- Neither has an application caller, appears in an RLS policy (USING or WITH
-- CHECK), or is called by another function, so revoking anon breaks nothing.
-- The `authenticated` grant is deliberately left in place: it is a far less
-- interesting leak and removing it risks a caller this audit did not surface.

revoke execute on function public.has_active_premium_invite(uuid) from public, anon;
revoke execute on function public.is_galley_premium(uuid)         from public, anon;

-- ----------------------------------------------------------------------
-- NOT revoked, on purpose — read this before "finishing the job".
-- ----------------------------------------------------------------------
-- is_galley_member(uuid), is_galley_owner(uuid) and is_galley_public(uuid) are
-- still executable by anon and authenticated, and the linter will keep flagging
-- them. Leave them alone. They are called from inside RLS policies on galleys,
-- recipes, galley_members, cook_next_history and discover_memory, and a policy
-- expression is evaluated with the privileges of the querying role. Revoking
-- EXECUTE would make those policies error out for that role — taking down
-- anonymous access to public galleys and share-token recipes with it.
