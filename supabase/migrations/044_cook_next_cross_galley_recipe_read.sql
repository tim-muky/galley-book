-- When user A adds a recipe to a shared galley's cook-next list, other
-- members of that galley couldn't read the recipe metadata if the recipe
-- lived in a galley they didn't belong to (e.g. A's personal galley).
-- The cook_next_list row was visible (membership in the shared galley)
-- but the joined recipes(...) select returned null, leaving blank cards.
--
-- Add a permissive SELECT policy on recipes (and recipe_tags) granting
-- read access to any recipe sitting on the cook_next_list of a galley
-- the requester is a member of. recipe_photos, ingredients, and
-- preparation_steps are already world-readable, so no change there.

create index if not exists idx_cook_next_list_recipe_id
  on public.cook_next_list(recipe_id);

create policy "Cook-next viewers can read recipes"
  on public.recipes for select
  using (
    exists (
      select 1
      from public.cook_next_list cnl
      join public.galley_members gm on gm.galley_id = cnl.galley_id
      where cnl.recipe_id = recipes.id
        and gm.user_id = auth.uid()
    )
  );

create policy "Cook-next viewers can read recipe tags"
  on public.recipe_tags for select
  using (
    exists (
      select 1
      from public.cook_next_list cnl
      join public.galley_members gm on gm.galley_id = cnl.galley_id
      where cnl.recipe_id = recipe_tags.recipe_id
        and gm.user_id = auth.uid()
    )
  );
