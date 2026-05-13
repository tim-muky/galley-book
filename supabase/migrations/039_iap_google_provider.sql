-- GAL-273: prepare iap_subscriptions for Google Play receipts.
--
-- 028 modeled the table around Apple's per-renewal transaction_id (UNIQUE).
-- Play's analogous identifier is purchaseToken — stable across renewals,
-- not per-renewal. Add a shared "original_purchase_token" column and move
-- the dedup constraint there. Apple rows backfill from
-- original_transaction_id (Apple's stable analog).

alter type public.iap_source add value if not exists 'google_iap';

alter table public.iap_subscriptions
  add column if not exists original_purchase_token text;

update public.iap_subscriptions
  set original_purchase_token = original_transaction_id
  where original_purchase_token is null
    and original_transaction_id is not null;

alter table public.iap_subscriptions
  drop constraint if exists iap_subscriptions_transaction_id_key;

create unique index if not exists iap_subscriptions_original_purchase_token_unique
  on public.iap_subscriptions (original_purchase_token)
  where original_purchase_token is not null;
