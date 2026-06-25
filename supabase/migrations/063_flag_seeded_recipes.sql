-- GAL-477: distinguish the seeded default recipes (copied into every new user's
-- first galley by seed_default_recipes) from real, self-saved recipes, so
-- activation/engagement metrics count only self-saved ones. The copies are
-- inserted with created_by = the user, so they otherwise look like genuine saves.

-- 1. Column.
alter table public.recipes
  add column if not exists is_seeded boolean not null default false;

-- 2. Flag future copies: re-create seed_default_recipes with is_seeded = true on
--    the inserted rows. Signature unchanged (uuid, uuid) -> CREATE OR REPLACE is safe.
create or replace function public.seed_default_recipes(
  p_galley_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  template_galley_id constant uuid := '00000000-0000-0000-0000-0000000005a1';
  src record;
  new_id uuid;
begin
  for src in
    select id, name, description, servings, prep_time, season, type, source_url
    from public.recipes
    where galley_id = template_galley_id
      and deleted_at is null
  loop
    insert into public.recipes (
      galley_id, created_by, name, description,
      servings, prep_time, season, type, source_url, is_seeded
    )
    values (
      p_galley_id, p_user_id, src.name, src.description,
      src.servings, src.prep_time, src.season, src.type, src.source_url, true
    )
    returning id into new_id;

    insert into public.ingredients (recipe_id, name, amount, unit, group_name, sort_order)
    select new_id, name, amount, unit, group_name, sort_order
    from public.ingredients where recipe_id = src.id;

    insert into public.preparation_steps (recipe_id, step_number, instruction)
    select new_id, step_number, instruction
    from public.preparation_steps where recipe_id = src.id;

    insert into public.recipe_photos (recipe_id, storage_path, is_primary, sort_order)
    select new_id, storage_path, is_primary, sort_order
    from public.recipe_photos where recipe_id = src.id;

    insert into public.recipe_tags (recipe_id, kind, value)
    select new_id, kind, value
    from public.recipe_tags where recipe_id = src.id;
  end loop;
end;
$func$;

grant execute on function public.seed_default_recipes(uuid, uuid) to authenticated, service_role;

-- 3. Backfill. Flag the template rows themselves, and every existing copy.
--    A copy = a non-template recipe whose (name, description) BOTH match a current
--    template recipe -- name alone could false-flag a real save that shares a title.

-- 3a. The 3 canonical template rows in the system galley.
update public.recipes
set is_seeded = true
where galley_id = '00000000-0000-0000-0000-0000000005a1';

-- 3b. Their copies sitting in real user galleys.
update public.recipes r
set is_seeded = true
where r.galley_id <> '00000000-0000-0000-0000-0000000005a1'
  and r.is_seeded = false
  and exists (
    select 1
    from public.recipes tpl
    where tpl.galley_id = '00000000-0000-0000-0000-0000000005a1'
      and tpl.deleted_at is null
      and tpl.name = r.name
      and coalesce(tpl.description, '') = coalesce(r.description, '')
  );
