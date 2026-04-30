-- The default RLS policy on public.users only allows a user to read their
-- OWN row. Members lists, comment author rendering, and Cook Next "Added
-- by NAME" all need to read other users' name/avatar/email — which today
-- comes back null and shows as a blank row in the UI.
--
-- This migration adds a second SELECT policy: a row in public.users is
-- readable to any caller who shares at least one galley membership with
-- that user. Anonymous users still see nothing; service-role bypasses
-- RLS as before.
--
-- The original "users can read own profile" policy stays — this one is
-- additive (Postgres RLS is OR across policies of the same command).

create policy "users_readable_to_galley_mates"
  on public.users
  for select
  using (
    auth.uid() = id
    or exists (
      select 1
      from public.galley_members me
      join public.galley_members them
        on them.galley_id = me.galley_id
      where me.user_id   = auth.uid()
        and them.user_id = public.users.id
    )
  );
