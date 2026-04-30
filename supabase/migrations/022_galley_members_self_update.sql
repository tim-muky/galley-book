-- Lets a user toggle is_default on their own galley_members rows so the
-- "default galley" star in Settings → Your galleys can persist.
-- Reported on 2026-04-30 — see GAL-224 for product rationale.
--
-- Without this policy, only the galley owner could update membership
-- rows (per the existing "Galley owner can manage members" policy).
-- A non-owner couldn't pin a galley they're a member of as their
-- personal default, even though is_default is per-user-per-membership.
--
-- Limited to the user's own rows (user_id = auth.uid()) so this can't
-- be abused to flip rows for other users in the same galley.

drop policy if exists "Users can update own membership" on public.galley_members;
create policy "Users can update own membership"
  on public.galley_members
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
