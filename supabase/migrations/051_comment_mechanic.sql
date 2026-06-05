-- GAL-433: comment → DM mechanic on galley_distributions.
-- The IG caption now carries a "comment TRIGGER" CTA; we store the trigger word
-- and the DM auto-reply copy (DE/EN) so the admin can wire it into ManyChat /
-- IG native auto-reply. No new table → existing grants/RLS on
-- galley_distributions still apply.

alter table public.galley_distributions
  add column if not exists comment_trigger text,
  add column if not exists dm_reply_de     text,
  add column if not exists dm_reply_en     text;
