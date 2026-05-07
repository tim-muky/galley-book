-- Private bucket for transient parse-step image uploads (GAL-293).
--
-- The Instagram parser fetches a CDN image and re-hosts it so the
-- recipe-save flow has a stable URL (Instagram CDN URLs expire in seconds).
-- Previously this lived under `recipe-photos/temp/{userId}/...` in the
-- *public* bucket, which exposed every transient upload to the world for
-- up to 24h. Move to a dedicated *private* bucket and use signed URLs.
--
-- Object key convention: `<user_id>/<uuid>.<ext>`. Folder prefix lets RLS
-- match owner via `storage.foldername(name)[1]`.
--
-- Daily cleanup cron deletes objects older than 24h.

insert into storage.buckets (id, name, public)
values ('recipe-temp', 'recipe-temp', false)
on conflict (id) do update set public = false;

drop policy if exists "recipe-temp: owner can read" on storage.objects;
create policy "recipe-temp: owner can read"
  on storage.objects for select
  using (
    bucket_id = 'recipe-temp'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "recipe-temp: owner can write" on storage.objects;
create policy "recipe-temp: owner can write"
  on storage.objects for insert
  with check (
    bucket_id = 'recipe-temp'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "recipe-temp: owner can update" on storage.objects;
create policy "recipe-temp: owner can update"
  on storage.objects for update
  using (
    bucket_id = 'recipe-temp'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "recipe-temp: owner can delete" on storage.objects;
create policy "recipe-temp: owner can delete"
  on storage.objects for delete
  using (
    bucket_id = 'recipe-temp'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- NOTE: leftover files in `recipe-photos/temp/*` need to be removed via the
-- Storage API (or dashboard). Direct DELETE on storage.objects is blocked by
-- a Supabase trigger to prevent orphaned object refs.
