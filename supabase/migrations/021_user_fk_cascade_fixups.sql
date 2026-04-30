-- Account deletion (DELETE /api/account) was failing with HTTP 500
-- "Database error deleting user" because three FKs referencing
-- public.users(id) defaulted to NO ACTION:
--
--   * recipes.created_by
--   * saved_sources.added_by
--   * recipe_translations.translated_by
--
-- The route's anonymisation step nulls created_by / added_by for rows
-- in galleys the user does NOT own, expecting cascade-deletion of rows
-- in their owned galleys via the galleys → recipes / saved_sources
-- cascade. But there was no cleanup at all for recipe_translations,
-- and ALTER COLUMN DROP NOT NULL (migration 002) didn't change the FK
-- on-delete behaviour. So the user delete blew up at the FK check.
--
-- Switching all three to ON DELETE SET NULL is the simplest fix:
-- attribution disappears (matches what the route already does for the
-- non-owned case), but the rows survive when the recipe lives on
-- (e.g. copied to another galley).

-- recipes.created_by -> SET NULL
alter table public.recipes
  drop constraint if exists recipes_created_by_fkey;
alter table public.recipes
  add constraint recipes_created_by_fkey
  foreign key (created_by) references public.users(id) on delete set null;

-- saved_sources.added_by -> SET NULL
alter table public.saved_sources
  drop constraint if exists saved_sources_added_by_fkey;
alter table public.saved_sources
  add constraint saved_sources_added_by_fkey
  foreign key (added_by) references public.users(id) on delete set null;

-- recipe_translations.translated_by -> SET NULL
alter table public.recipe_translations
  drop constraint if exists recipe_translations_translated_by_fkey;
alter table public.recipe_translations
  add constraint recipe_translations_translated_by_fkey
  foreign key (translated_by) references public.users(id) on delete set null;
