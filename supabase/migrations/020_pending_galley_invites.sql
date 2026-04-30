-- Lets a galley owner invite an email that doesn't have a Galley Book
-- account yet. The invite is queued in pending_galley_invites and
-- consumed automatically the first time the invitee signs in (handled
-- by an AFTER INSERT trigger on public.users).
--
-- Reported on 2026-04-30 device review — see GAL-220 for the full
-- product rationale.
--
-- Note: written idempotently (drop-if-exists before each create policy)
-- so partial reapplies don't fail with 42710 "policy already exists".

create table if not exists public.pending_galley_invites (
  id          uuid primary key default gen_random_uuid(),
  galley_id   uuid not null references public.galleys(id) on delete cascade,
  email       text not null,
  inviter_id  uuid references public.users(id) on delete set null,
  created_at  timestamptz default now() not null,
  -- Case-insensitive uniqueness: same email, same galley = at most one row
  constraint pending_galley_invites_unique unique (galley_id, email)
);

create index if not exists idx_pending_galley_invites_email
  on public.pending_galley_invites (lower(email));

alter table public.pending_galley_invites enable row level security;

drop policy if exists "galley_members_read_pending_invites"   on public.pending_galley_invites;
drop policy if exists "galley_members_insert_pending_invites" on public.pending_galley_invites;
drop policy if exists "galley_members_delete_pending_invites" on public.pending_galley_invites;

-- Galley members can read pending invites for their galley
create policy "galley_members_read_pending_invites"
  on public.pending_galley_invites
  for select
  using (
    exists (
      select 1 from public.galley_members
      where galley_members.galley_id = pending_galley_invites.galley_id
        and galley_members.user_id   = auth.uid()
    )
  );

-- Galley members can insert pending invites for their galley
create policy "galley_members_insert_pending_invites"
  on public.pending_galley_invites
  for insert
  with check (
    exists (
      select 1 from public.galley_members
      where galley_members.galley_id = pending_galley_invites.galley_id
        and galley_members.user_id   = auth.uid()
    )
  );

-- Galley members can delete pending invites for their galley (revoke)
create policy "galley_members_delete_pending_invites"
  on public.pending_galley_invites
  for delete
  using (
    exists (
      select 1 from public.galley_members
      where galley_members.galley_id = pending_galley_invites.galley_id
        and galley_members.user_id   = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Sign-in trigger: when handle_new_user fires, redeem any matching
-- pending invites by inserting galley_members rows and deleting the
-- pending row. Runs server-side with elevated privileges (security
-- definer), so RLS doesn't block the cross-galley insert.
-- ---------------------------------------------------------------------
create or replace function public.redeem_pending_invites_for_user()
returns trigger language plpgsql security definer set search_path = public as $func_redeem$
declare
  invite record;
begin
  for invite in
    select id, galley_id
    from public.pending_galley_invites
    where lower(email) = lower(new.email)
  loop
    insert into public.galley_members (galley_id, user_id, role, joined_at)
    values (invite.galley_id, new.id, 'member', now())
    on conflict do nothing;

    delete from public.pending_galley_invites where id = invite.id;
  end loop;
  return new;
end;
$func_redeem$;

drop trigger if exists redeem_pending_invites_after_user_insert on public.users;
create trigger redeem_pending_invites_after_user_insert
  after insert on public.users
  for each row execute procedure public.redeem_pending_invites_for_user();
