-- GAL-273: prepare iap_subscriptions for Google Play receipts.
--
-- 028 modeled the table per Apple transaction: transaction_id UNIQUE,
-- one row per transaction in a subscription series. Renewals create new
-- rows so original_transaction_id repeats across rows (not unique).
--
-- Play's analog is purchaseToken — STABLE across renewals, one per
-- subscription lifecycle. So Google rows want to UPDATE on renewal,
-- not insert.
--
-- Solution: keep Apple's per-transaction model intact, add Google rows
-- with a partial unique scoped to source = 'google_iap'. Apple rows
-- continue to dedup via the existing transaction_id UNIQUE and the
-- (user_id, galley_id) WHERE status='active' partial unique.

alter type public.iap_source add value if not exists 'google_iap';

alter table public.iap_subscriptions
  add column if not exists original_purchase_token text;

-- Apple backfill is informational only — for Apple rows the column
-- mirrors original_transaction_id but is not enforced unique (renewals
-- legitimately repeat). It lets the route code write the column
-- consistently across providers without branching.
update public.iap_subscriptions
  set original_purchase_token = original_transaction_id
  where original_purchase_token is null
    and original_transaction_id is not null;

-- Partial unique: enforce one row per subscription lifecycle ONLY on
-- Google rows. Apple uses transaction_id UNIQUE (declared by migration
-- 028) for its row-per-transaction model.
create unique index if not exists iap_subscriptions_google_purchase_token_unique
  on public.iap_subscriptions (original_purchase_token)
  where source = 'google_iap';
