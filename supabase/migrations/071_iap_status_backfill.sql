-- GAL-545: verify-receipt used to record every replayed receipt as
-- status='active' regardless of its expiry, and multi-receipt restores could
-- leave a long-dead receipt 'active' while flipping the genuinely live sub to
-- 'expired'. Reads follow the paid-through window (GAL-488) so entitlement was
-- unaffected, but status-keyed readers (premium-invite gate) misread.
--
-- Backfill the advisory status to match reality for the dead rows. Live rows
-- stored as 'expired'/'cancelled' are left alone: those statuses are
-- meaningful lifecycle states and every reader now applies the paid-window
-- rule instead of trusting status.
update public.iap_subscriptions
set status = 'expired'
where status = 'active'
  and expires_at is not null
  and expires_at < now();
