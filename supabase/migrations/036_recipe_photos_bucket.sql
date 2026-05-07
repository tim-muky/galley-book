-- Codify the recipe-photos bucket + policies as source-controlled (GAL-295).
--
-- This bucket has lived only in dashboard config since the project began.
-- Mirroring the existing production setup so a fresh project can be
-- bootstrapped reproducibly. Idempotent — safe to re-run.
--
-- Object key conventions:
--   `{recipeId}/primary.{ext}`           -- /api/recipes route
--   `{recipeId}/{photoId}.{ext}`         -- /api/recipes/[id]/photos route
--   `galleys/{galleyId}/header.{ext}`    -- /api/galleys/[id]/header-image
--
-- Write authorisation is enforced at the API-route level (galley membership,
-- recipe ownership). RLS just gates "must be signed in" — same as in
-- production today. Read is public so <Image> URLs work without signing.

insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "recipe-photos: anyone can read" on storage.objects;
create policy "recipe-photos: anyone can read"
  on storage.objects for select
  using (bucket_id = 'recipe-photos');

drop policy if exists "recipe-photos: authenticated can write" on storage.objects;
create policy "recipe-photos: authenticated can write"
  on storage.objects for insert
  with check (
    bucket_id = 'recipe-photos'
    and auth.uid() is not null
  );

drop policy if exists "recipe-photos: authenticated can update" on storage.objects;
create policy "recipe-photos: authenticated can update"
  on storage.objects for update
  using (
    bucket_id = 'recipe-photos'
    and auth.uid() is not null
  );

drop policy if exists "recipe-photos: authenticated can delete" on storage.objects;
create policy "recipe-photos: authenticated can delete"
  on storage.objects for delete
  using (
    bucket_id = 'recipe-photos'
    and auth.uid() is not null
  );
