-- GAL-278: bootstrap a default galley on first sign-in.
--
-- Today the web app onboards every user through `/onboarding` to collect a
-- galley name; native skips that flow entirely so new iOS users land with no
-- membership and the app silently breaks (recipe save, subscription panel,
-- etc.). Creating the first galley in `handle_new_user` makes onboarding
-- platform-agnostic — the web form becomes a renaming surface and the iOS
-- app just works.
--
-- Default name = "{first word of name}'s galley", or "My galley" if no name.
-- Brand convention: lowercase (`galleybook` / `galley`).

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

  -- Skip if any membership already exists (re-runs / data restores).
  if exists (select 1 from public.galley_members where user_id = new.id) then
    return new;
  end if;

  -- "Tim's galley" / "My galley". Strip trailing whitespace from the first
  -- token; if the user has no name we fall back to the generic label so the
  -- email-based default doesn't leak an address into the UI.
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

  return new;
end;
$func_new$;

-- ----------------------------------------------------------------------
-- Backfill existing users who signed up before this trigger landed.
-- Idempotent — only touches users with zero memberships.
-- ----------------------------------------------------------------------
do $backfill$
declare
  u record;
  galley_label text;
  new_galley_id uuid;
begin
  for u in
    select pu.id, pu.name, pu.email
    from public.users pu
    where not exists (
      select 1 from public.galley_members gm where gm.user_id = pu.id
    )
  loop
    galley_label := nullif(trim(split_part(coalesce(u.name, ''), ' ', 1)), '');
    if galley_label is null or galley_label = u.email then
      galley_label := 'My galley';
    else
      galley_label := galley_label || '''s galley';
    end if;

    insert into public.galleys (name, owner_id)
    values (galley_label, u.id)
    returning id into new_galley_id;

    insert into public.galley_members (galley_id, user_id, role, joined_at)
    values (new_galley_id, u.id, 'owner', now());
  end loop;
end
$backfill$;
