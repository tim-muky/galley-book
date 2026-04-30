-- Avatar uploads (GAL-212). New storage bucket `avatars/` for user-supplied
-- profile pictures, separate from the `recipe-photos/` bucket. Public-read
-- so the URL on public.users.avatar_url works without signed-URL juggling;
-- write/update/delete restricted to the owner of the row.
--
-- Object key convention: `avatars/<user_id>/avatar.jpg`. The folder prefix
-- makes the RLS policy a one-liner using `storage.foldername(name)[1]`.
--
-- Run after migrations 001..022.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars: anyone can read" on storage.objects;
create policy "avatars: anyone can read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars: owner can write" on storage.objects;
create policy "avatars: owner can write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars: owner can update" on storage.objects;
create policy "avatars: owner can update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars: owner can delete" on storage.objects;
create policy "avatars: owner can delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
