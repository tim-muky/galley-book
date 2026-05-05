-- GAL-185 + GAL-261 + GAL-262: iap_subscriptions table.
-- Foundation for Apple IAP, Apple Offer Codes, and admin-granted comp entitlement.
-- Premium is scoped per galley; any active row on a galley unlocks premium for
-- every member of that galley (galley-level entitlement, see GAL-261).

create type iap_source as enum ('apple_iap', 'apple_offer_code', 'comp');
create type iap_status as enum ('active', 'expired', 'in_billing_retry', 'cancelled', 'revoked');

create table public.iap_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.users(id) on delete cascade,
  galley_id                uuid not null references public.galleys(id) on delete cascade,

  product_id               text not null,                                -- e.g. com.galleybook.premium.monthly
  source                   iap_source not null,
  status                   iap_status not null default 'active',

  -- Apple-side identifiers (NULL for comp rows)
  transaction_id           text unique,
  original_transaction_id  text,                                         -- Apple's stable ID across renewals
  offer_identifier         text,                                         -- set when source = 'apple_offer_code'

  -- Lifetime
  starts_at                timestamptz not null default now(),
  expires_at               timestamptz,                                  -- NULL = forever (comp); Apple sets this for paid

  -- Comp audit fields
  granted_by               uuid references public.users(id),             -- admin who granted comp
  grant_reason             text,                                         -- "early access", "press", etc.
  revoked_at               timestamptz,
  revoked_by               uuid references public.users(id),

  -- Apple raw payload for debugging (last verify-receipt or notification body)
  raw_payload              jsonb,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- A user may not hold two active subs on the same galley (covers paid + comp races)
create unique index iap_subscriptions_one_active_per_user_galley
  on public.iap_subscriptions (user_id, galley_id)
  where status = 'active';

-- Hot path: galley-level entitlement check
create index iap_subscriptions_galley_status on public.iap_subscriptions (galley_id, status);

-- Apple webhook lookup
create index iap_subscriptions_original_transaction on public.iap_subscriptions (original_transaction_id) where original_transaction_id is not null;

-- Analytics
create index iap_subscriptions_source on public.iap_subscriptions (source);

create trigger iap_subscriptions_set_updated_at
  before update on public.iap_subscriptions
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.iap_subscriptions enable row level security;

-- Galley members can read sub state for their galleys (so the UI can show
-- "premium" badges, manage links, expiry warnings, etc.)
create policy "Galley members can read iap subscriptions"
  on public.iap_subscriptions for select
  using (
    exists (
      select 1 from public.galley_members gm
      where gm.galley_id = iap_subscriptions.galley_id
        and gm.user_id = auth.uid()
    )
  );

-- No insert / update / delete policies → only the service role can write.
-- Verify-receipt, App Store webhook, and the admin comp routes all run with
-- service role from the server.

-- ============================================================
-- Entitlement helper (galley-level, see GAL-261)
-- ============================================================
create or replace function public.is_galley_premium(p_galley_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.iap_subscriptions
    where galley_id = p_galley_id
      and status = 'active'
      and (expires_at is null or expires_at > now())
  );
$$;

grant execute on function public.is_galley_premium(uuid) to authenticated;
