-- ============================================================
-- Galley Book – Initial Schema
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
create type recipe_season as enum ('spring', 'summer', 'autumn', 'winter', 'all_year');
create type recipe_type as enum ('starter', 'main', 'dessert', 'breakfast', 'snack', 'drink', 'side');
create type galley_role as enum ('owner', 'member');
create type source_type as enum ('instagram', 'youtube', 'website');

-- ============================================================
-- TABLES (all created before any policies)
-- ============================================================

create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  name        text,
  username    text unique,
  avatar_url  text,
  created_at  timestamptz default now() not null
);

create table public.galleys (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz default now() not null
);

create table public.galley_members (
  id          uuid primary key default gen_random_uuid(),
  galley_id   uuid not null references public.galleys(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  role        galley_role not null default 'member',
  invited_at  timestamptz default now() not null,
  joined_at   timestamptz,
  unique (galley_id, user_id)
);

create table public.recipes (
  id           uuid primary key default gen_random_uuid(),
  galley_id    uuid not null references public.galleys(id) on delete cascade,
  created_by   uuid not null references public.users(id),
  name         text not null,
  description  text,
  servings     integer default 4,
  prep_time    integer,
  season       recipe_season default 'all_year',
  type         recipe_type,
  source_url   text,
  share_token  uuid unique not null default gen_random_uuid(),
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null
);

create table public.recipe_photos (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references public.recipes(id) on delete cascade,
  storage_path  text not null,
  is_primary    boolean default false,
  sort_order    integer default 0,
  created_at    timestamptz default now() not null
);

create table public.ingredients (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  name        text not null,
  amount      numeric,
  unit        text,
  sort_order  integer default 0,
  created_at  timestamptz default now() not null
);

create table public.preparation_steps (
  id                 uuid primary key default gen_random_uuid(),
  recipe_id          uuid not null references public.recipes(id) on delete cascade,
  step_number        integer not null,
  instruction        text not null,
  photo_storage_path text,
  created_at         timestamptz default now() not null
);

create table public.votes (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  value       integer not null check (value between 1 and 5),
  created_at  timestamptz default now() not null,
  unique (recipe_id, user_id)
);

create table public.saved_sources (
  id              uuid primary key default gen_random_uuid(),
  galley_id       uuid not null references public.galleys(id) on delete cascade,
  added_by        uuid not null references public.users(id),
  url             text not null,
  source_type     source_type not null,
  handle_or_name  text,
  created_at      timestamptz default now() not null
);

-- ============================================================
-- TRIGGERS
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users enable row level security;
alter table public.galleys enable row level security;
alter table public.galley_members enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_photos enable row level security;
alter table public.ingredients enable row level security;
alter table public.preparation_steps enable row level security;
alter table public.votes enable row level security;
alter table public.saved_sources enable row level security;

-- users
create policy "Users can read own profile"
  on public.users for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.users for update using (auth.uid() = id);

-- galleys
create policy "Galley members can read galley"
  on public.galleys for select
  using (
    exists (
      select 1 from public.galley_members gm
      where gm.galley_id = id and gm.user_id = auth.uid()
    )
  );

create policy "Galley owner can update galley"
  on public.galleys for update using (owner_id = auth.uid());

create policy "Authenticated users can create galleys"
  on public.galleys for insert with check (auth.uid() is not null);

-- galley_members
create policy "Members can read their own memberships"
  on public.galley_members for select using (user_id = auth.uid());

create policy "Galley owner can manage members"
  on public.galley_members for all
  using (
    exists (
      select 1 from public.galleys g
      where g.id = galley_id and g.owner_id = auth.uid()
    )
  );

create policy "Users can join galleys they are invited to"
  on public.galley_members for insert
  with check (user_id = auth.uid());

-- recipes
create policy "Galley members can read recipes"
  on public.recipes for select
  using (
    exists (
      select 1 from public.galley_members gm
      where gm.galley_id = recipes.galley_id and gm.user_id = auth.uid()
    )
    or share_token is not null  -- public share pages
  );

create policy "Galley members can create recipes"
  on public.recipes for insert
  with check (
    exists (
      select 1 from public.galley_members gm
      where gm.galley_id = galley_id and gm.user_id = auth.uid()
    )
  );

create policy "Galley members can update recipes"
  on public.recipes for update
  using (
    exists (
      select 1 from public.galley_members gm
      where gm.galley_id = recipes.galley_id and gm.user_id = auth.uid()
    )
  );

create policy "Galley members can delete recipes"
  on public.recipes for delete
  using (
    exists (
      select 1 from public.galley_members gm
      where gm.galley_id = recipes.galley_id and gm.user_id = auth.uid()
    )
  );

-- recipe_photos
create policy "Anyone can read recipe photos"
  on public.recipe_photos for select using (true);

create policy "Galley members can manage recipe photos"
  on public.recipe_photos for all
  using (
    exists (
      select 1 from public.recipes r
      join public.galley_members gm on gm.galley_id = r.galley_id
      where r.id = recipe_id and gm.user_id = auth.uid()
    )
  );

-- ingredients
create policy "Anyone can read ingredients"
  on public.ingredients for select using (true);

create policy "Galley members can manage ingredients"
  on public.ingredients for all
  using (
    exists (
      select 1 from public.recipes r
      join public.galley_members gm on gm.galley_id = r.galley_id
      where r.id = recipe_id and gm.user_id = auth.uid()
    )
  );

-- preparation_steps
create policy "Anyone can read steps"
  on public.preparation_steps for select using (true);

create policy "Galley members can manage steps"
  on public.preparation_steps for all
  using (
    exists (
      select 1 from public.recipes r
      join public.galley_members gm on gm.galley_id = r.galley_id
      where r.id = recipe_id and gm.user_id = auth.uid()
    )
  );

-- votes
create policy "Galley members can vote"
  on public.votes for all
  using (
    exists (
      select 1 from public.recipes r
      join public.galley_members gm on gm.galley_id = r.galley_id
      where r.id = recipe_id and gm.user_id = auth.uid()
    )
  );

-- saved_sources
create policy "Galley members can manage saved sources"
  on public.saved_sources for all
  using (
    exists (
      select 1 from public.galley_members gm
      where gm.galley_id = saved_sources.galley_id and gm.user_id = auth.uid()
    )
  );
