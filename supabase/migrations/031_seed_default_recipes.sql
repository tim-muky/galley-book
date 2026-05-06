-- GAL-17 follow-up: every brand-new galley should land with the four default
-- recipes pre-installed. The previous Done state covered only the
-- POST /api/galleys path; after GAL-278 the auto-create trigger started
-- making galleys directly and the seeding step was skipped, so new users
-- got an empty library.
--
-- Strategy: pull the seeding logic into a Postgres function so the trigger
-- can call it atomically. The TS API route also delegates to this function,
-- keeping the share-token list in exactly one place.

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
  share_tokens uuid[] := array[
    'fc7ecf27-481d-4eb7-9c97-9166e40310fb'::uuid,
    '8f88f05f-9b75-4e16-9d98-c3381b0a3d51'::uuid,
    '3f53c072-1bda-401f-807a-7bb6ab4be811'::uuid,
    '5fde9d0a-a7d3-4dd4-b74e-ff95f7e489b0'::uuid
  ];
  src record;
  new_id uuid;
begin
  for src in
    select id, name, description, servings, prep_time, season, type, source_url
    from public.recipes
    where share_token = any(share_tokens)
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

-- ----------------------------------------------------------------------
-- Extend handle_new_user to seed the auto-created galley.
-- ----------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $func_new$
declare
  resolved_name text;
  galley_label text;
  new_galley_id uuid;
begin
  resolved_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    new.email
  );

  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    resolved_name,
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  )
  on conflict (id) do nothing;

  if exists (select 1 from public.galley_members where user_id = new.id) then
    return new;
  end if;

  galley_label := nullif(trim(split_part(coalesce(resolved_name, ''), ' ', 1)), '');
  if galley_label is null or galley_label = new.email then
    galley_label := 'My galley';
  else
    galley_label := galley_label || '''s galley';
  end if;

  insert into public.galleys (name, owner_id)
  values (galley_label, new.id)
  returning id into new_galley_id;

  insert into public.galley_members (galley_id, user_id, role, joined_at)
  values (new_galley_id, new.id, 'owner', now());

  -- Seed default recipes (best-effort — failure here doesn't block signup).
  begin
    perform public.seed_default_recipes(new_galley_id, new.id);
  exception when others then
    raise warning 'seed_default_recipes failed for user %: %', new.id, sqlerrm;
  end;

  return new;
end;
$func_new$;

-- ----------------------------------------------------------------------
-- Backfill: only seed a user's FIRST galley if it's empty.
--
-- Per product rule (2026-05-06): default recipes only land in the user's
-- first galley. Galleys #2+ are intentional separate spaces — don't
-- pollute them, even if empty. So we skip any owner who already has more
-- than one galley.
-- ----------------------------------------------------------------------
do $backfill$
declare
  g record;
begin
  for g in
    select gly.id, gly.owner_id
    from public.galleys gly
    where not exists (
      select 1 from public.recipes r
      where r.galley_id = gly.id and r.deleted_at is null
    )
    and (
      select count(*) from public.galleys other
      where other.owner_id = gly.owner_id
    ) = 1
  loop
    perform public.seed_default_recipes(g.id, g.owner_id);
  end loop;
end
$backfill$;
