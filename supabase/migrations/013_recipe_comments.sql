-- GAL-119: comments on recipe detail page.
-- Comments live on the recipe (FK cascade) so they automatically travel
-- when a recipe is moved or copied — copy logic that re-inserts the recipe
-- gets a new id, so comments naturally do not follow a copy unless the
-- copy logic explicitly clones them. For the move case (same recipe row,
-- different galley_id) comments stay attached. That matches the spec.

create table public.recipe_comments (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index recipe_comments_recipe_idx
  on public.recipe_comments(recipe_id, created_at);

alter table public.recipe_comments enable row level security;

create policy "members read comments"
  on public.recipe_comments for select
  using (
    exists (
      select 1
      from public.galley_members gm
      join public.recipes r on r.galley_id = gm.galley_id
      where r.id = recipe_comments.recipe_id
        and gm.user_id = auth.uid()
    )
  );

create policy "members insert comments"
  on public.recipe_comments for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1
      from public.galley_members gm
      join public.recipes r on r.galley_id = gm.galley_id
      where r.id = recipe_comments.recipe_id
        and gm.user_id = auth.uid()
    )
  );

create policy "author or owner delete comments"
  on public.recipe_comments for delete
  using (
    author_id = auth.uid()
    or exists (
      select 1
      from public.galleys g
      join public.recipes r on r.galley_id = g.id
      where r.id = recipe_comments.recipe_id
        and g.owner_id = auth.uid()
    )
  );
