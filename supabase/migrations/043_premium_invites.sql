-- GAL-350: premium_invites — one-other-user sharing of premium across platforms.
-- Each premium subscriber may have at most one outstanding (pending) or active
-- invite. If revoked or expired, the slot frees up. Cascade revocation is
-- implicit: entitlement reads join against the inviter's live sub, so when the
-- inviter cancels/lapses/deletes, the invitee drops to free on next status read.

create type premium_invite_status as enum ('pending', 'active', 'revoked', 'expired');

create table public.premium_invites (
  id                  uuid primary key default gen_random_uuid(),
  inviter_user_id     uuid not null references public.users(id) on delete cascade,
  invitee_user_id     uuid references public.users(id) on delete cascade,
  invite_token        text not null unique,
  status              premium_invite_status not null default 'pending',
  expires_at          timestamptz not null,  -- unclaimed-token TTL (7 days)
  claimed_at          timestamptz,
  revoked_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One outstanding/active invite per inviter. Frees up on revoke/expire.
create unique index premium_invites_one_open_per_inviter
  on public.premium_invites (inviter_user_id)
  where status in ('pending', 'active');

-- An invitee can only be the active beneficiary of one invite at a time.
create unique index premium_invites_one_active_per_invitee
  on public.premium_invites (invitee_user_id)
  where status = 'active' and invitee_user_id is not null;

create index premium_invites_invitee on public.premium_invites (invitee_user_id) where invitee_user_id is not null;
create index premium_invites_inviter on public.premium_invites (inviter_user_id);

create trigger premium_invites_set_updated_at
  before update on public.premium_invites
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.premium_invites enable row level security;

-- Inviter reads their own invites
create policy "Inviter can read own invites"
  on public.premium_invites for select
  using (inviter_user_id = auth.uid());

-- Invitee reads invites they've claimed
create policy "Invitee can read own claimed invite"
  on public.premium_invites for select
  using (invitee_user_id = auth.uid());

-- All writes go through service-role server routes (create/claim/revoke).
-- No insert/update/delete policies for authenticated users.

-- ============================================================
-- Entitlement helper: does this user have an active invite whose inviter
-- still has an active sub? Returns the invite row or empty.
-- ============================================================
create or replace function public.has_active_premium_invite(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.premium_invites pi
      join public.iap_subscriptions s on s.user_id = pi.inviter_user_id
     where pi.invitee_user_id = p_user_id
       and pi.status = 'active'
       and s.status = 'active'
       and (s.expires_at is null or s.expires_at > now())
  );
$$;

grant execute on function public.has_active_premium_invite(uuid) to authenticated;
