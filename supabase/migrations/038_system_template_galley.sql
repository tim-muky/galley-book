-- GAL-followup: the default-recipe source used to live in whichever real user
-- galley happened to own the rows matching the hard-coded share_tokens. When
-- that galley got deleted the seed template disappeared and new signups
-- landed in an empty library. Decouple the templates from any real user by
-- moving them into a dedicated, delete-protected system galley.

-- 1. Mark system-owned galleys so they survive cascades and admin actions.
alter table public.galleys
  add column if not exists is_system boolean not null default false;

-- 2. Create the system user that owns the template galley.
--    Fixed UUIDs so the migration is idempotent and other code can reference them.
do $sys_user$
declare
  sys_user_id  uuid := '00000000-0000-0000-0000-0000000005ee'; -- "see(d)"
  sys_email    text := 'system+templates@galleybook.com';
begin
  insert into auth.users (id, email, instance_id, aud, role, created_at, updated_at)
  values (
    sys_user_id, sys_email,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    now(), now()
  )
  on conflict (id) do nothing;

  insert into public.users (id, email, name)
  values (sys_user_id, sys_email, 'galleybook templates')
  on conflict (id) do nothing;
end
$sys_user$;

-- 3. Create the system galley.
insert into public.galleys (id, name, owner_id, is_system)
values (
  '00000000-0000-0000-0000-0000000005a1', -- "sea(l)"
  'galleybook templates',
  '00000000-0000-0000-0000-0000000005ee',
  true
)
on conflict (id) do nothing;

-- 4. Move the three current default recipes into the system galley.
--    Children (ingredients, steps, photos, tags) follow via FK.
update public.recipes
set
  galley_id  = '00000000-0000-0000-0000-0000000005a1',
  created_by = '00000000-0000-0000-0000-0000000005ee'
where id in (
  '492bdfd7-9f76-492b-97d9-15678bdaaf29',
  'bfe8553b-bf70-4d92-b01c-93cf14cad58c',
  '2082e75b-3490-46c0-a35c-b333990dba5e'
)
and deleted_at is null;

-- 5. Delete-protect the system galley and any recipe living inside it.
create or replace function public.prevent_system_galley_delete()
returns trigger language plpgsql as $f$
begin
  if old.is_system then
    raise exception 'System galley % cannot be deleted', old.id;
  end if;
  return old;
end
$f$;

drop trigger if exists trg_prevent_system_galley_delete on public.galleys;
create trigger trg_prevent_system_galley_delete
  before delete on public.galleys
  for each row execute function public.prevent_system_galley_delete();

create or replace function public.prevent_system_recipe_delete()
returns trigger language plpgsql as $f$
begin
  if exists (
    select 1 from public.galleys g
    where g.id = old.galley_id and g.is_system
  ) then
    raise exception 'Recipe % belongs to a system galley and cannot be deleted', old.id;
  end if;
  return old;
end
$f$;

drop trigger if exists trg_prevent_system_recipe_delete on public.recipes;
create trigger trg_prevent_system_recipe_delete
  before delete on public.recipes
  for each row execute function public.prevent_system_recipe_delete();

-- 6. Reseed from the system galley rather than from share_tokens.
--    Any recipe in the template galley becomes a default — to add/remove a
--    default, edit the system galley (via SQL or by signing in as the system
--    user). No more code change required.
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
      servings, prep_time, season, type, source_url
    )
    values (
      p_galley_id, p_user_id, src.name, src.description,
      src.servings, src.prep_time, src.season, src.type, src.source_url
    )
    returning id into new_id;

    insert into public.ingredients (recipe_id, name, amount, unit, group_name, sort_order)
    select new_id, name, amount, unit, group_name, sort_order
    from public.ingredients
    where recipe_id = src.id;

    insert into public.preparation_steps (recipe_id, step_number, instruction)
    select new_id, step_number, instruction
    from public.preparation_steps
    where recipe_id = src.id;

    insert into public.recipe_photos (recipe_id, storage_path, is_primary, sort_order)
    select new_id, storage_path, is_primary, sort_order
    from public.recipe_photos
    where recipe_id = src.id;

    insert into public.recipe_tags (recipe_id, kind, value)
    select new_id, kind, value
    from public.recipe_tags
    where recipe_id = src.id;
  end loop;
end;
$func$;

grant execute on function public.seed_default_recipes(uuid, uuid) to authenticated, service_role;
