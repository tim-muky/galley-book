-- Members list (web + native) renders from public.users.name and
-- public.users.avatar_url. The 001_initial handle_new_user trigger only
-- copies these on insert, and only reads "full_name" — not "name". When
-- Google updates a user's metadata after sign-up (or for users who
-- existed before the trigger was added), the public row goes stale and
-- the Members card shows blank rows.
--
-- This migration:
--   1. Backfills public.users.name and public.users.avatar_url from
--      auth.users.raw_user_meta_data, preferring "full_name" then
--      "name". Only fills NULLs — existing customisations stay.
--   2. Replaces handle_new_user so it writes both name and avatar_url
--      with a sensible coalesce ladder.
--   3. Adds an AFTER UPDATE trigger so subsequent metadata changes from
--      Google flow through to public.users. Like the insert trigger,
--      only fills nulls / refreshes when the metadata actually changed.

-- ----------------------------------------------------------------------
-- 1. Backfill existing rows
-- ----------------------------------------------------------------------
update public.users u
set
  name = coalesce(
    u.name,
    a.raw_user_meta_data->>'full_name',
    a.raw_user_meta_data->>'name'
  ),
  avatar_url = coalesce(
    u.avatar_url,
    a.raw_user_meta_data->>'avatar_url',
    a.raw_user_meta_data->>'picture'
  )
from auth.users a
where a.id = u.id
  and (u.name is null or u.avatar_url is null);

-- ----------------------------------------------------------------------
-- 2. Replace insert handler with broader coalesce ladder
-- ----------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.email
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ----------------------------------------------------------------------
-- 3. UPDATE trigger so identity changes propagate
-- ----------------------------------------------------------------------
create or replace function public.handle_user_metadata_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.users
  set
    name = coalesce(
      name,
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    avatar_url = coalesce(
      avatar_url,
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_updated on auth.users;
create trigger on_auth_user_metadata_updated
  after update of raw_user_meta_data on auth.users
  for each row execute procedure public.handle_user_metadata_update();
