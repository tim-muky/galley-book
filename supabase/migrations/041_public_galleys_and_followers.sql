-- GAL-331 + GAL-332: Public Galleys.
--
-- A galley owner can flip their galley to public. Public galleys are
-- discoverable by other signed-in galleybook users via search (GAL-333)
-- and can be FOLLOWED (a new read-only relationship distinct from
-- membership). Followers see the galley and its recipes but cannot
-- mutate anything.
--
-- When the owner flips a public galley back to private, all follower
-- rows are deleted (GAL-331). The application layer enforces that
-- deletion in the same transaction as the flip, but RLS also protects
-- followers from reading the galley once is_public flips false.

alter table public.galleys
  add column if not exists is_public boolean not null default false,
  add column if not exists public_since timestamptz;

create table if not exists public.galley_followers (
  user_id uuid not null references auth.users(id) on delete cascade,
  galley_id uuid not null references public.galleys(id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (user_id, galley_id)
);

create index if not exists galley_followers_galley_idx
  on public.galley_followers(galley_id);

alter table public.galley_followers enable row level security;

-- A user can manage their own follows. A galley owner can see who
-- follows their galley (for count display).
create policy "galley_followers_select_own"
  on public.galley_followers for select
  using (auth.uid() = user_id);

create policy "galley_followers_select_owner"
  on public.galley_followers for select
  using (
    exists (
      select 1 from public.galleys g
      where g.id = galley_followers.galley_id and g.owner_id = auth.uid()
    )
  );

create policy "galley_followers_insert_own"
  on public.galley_followers for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.galleys g
      where g.id = galley_id and g.is_public = true
    )
  );

create policy "galley_followers_delete_own"
  on public.galley_followers for delete
  using (auth.uid() = user_id);

-- Extend the galley SELECT policy to allow non-member viewers to read
-- public galleys (needed for discovery + preview).
drop policy if exists "Galley members can read galley" on public.galleys;
create policy "Galley members or public viewers can read galley"
  on public.galleys for select
  using (
    is_galley_member(id)
    or is_public = true
  );

-- Same for recipes — any signed-in user can SELECT recipes belonging to
-- a public galley. RLS on the child tables (ingredients,
-- preparation_steps, recipe_photos, recipe_tags) is unchanged — APIs
-- read those through queries scoped by recipe_id and rely on the
-- recipes policy via PostgREST embedded selects.
drop policy if exists "Galley members can read recipes" on public.recipes;
create policy "Galley members or public viewers can read recipes"
  on public.recipes for select
  using (
    (exists (
      select 1 from public.galley_members gm
      where gm.galley_id = recipes.galley_id and gm.user_id = auth.uid()
    ))
    or (share_token is not null)
    or (
      exists (
        select 1 from public.galleys g
        where g.id = recipes.galley_id and g.is_public = true
      )
    )
  );
