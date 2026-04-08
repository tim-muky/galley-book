-- Migration 002: make created_by and added_by nullable
--
-- This is required for account deletion: when a user deletes their account,
-- recipes and sources they created in OTHER people's galleys are anonymised
-- (creator attribution set to NULL) rather than deleted, so the galley is
-- not disrupted.
--
-- Recipes in the deleting user's own galleys are cascade-deleted automatically
-- when the galley is deleted (galleys.owner_id → users.id ON DELETE CASCADE).
--
-- This is a backward-compatible change: only a NOT NULL constraint is relaxed.
-- No existing data is modified.

ALTER TABLE public.recipes
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.saved_sources
  ALTER COLUMN added_by DROP NOT NULL;
