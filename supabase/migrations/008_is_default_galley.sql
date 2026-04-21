-- Add is_default flag to galley_members so each user can designate one galley
-- as their primary across all multi-galley screens.

ALTER TABLE public.galley_members
  ADD COLUMN is_default boolean NOT NULL DEFAULT false;

-- Backfill: each user's earliest membership becomes their default.
WITH earliest AS (
  SELECT DISTINCT ON (user_id) id
  FROM public.galley_members
  ORDER BY user_id, invited_at ASC
)
UPDATE public.galley_members
SET is_default = true
WHERE id IN (SELECT id FROM earliest);

-- Enforce at most one default per user at the DB level.
CREATE UNIQUE INDEX galley_members_one_default_per_user
  ON public.galley_members (user_id)
  WHERE is_default = true;
