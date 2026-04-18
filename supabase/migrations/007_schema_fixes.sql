-- Fix 1: Add group_name to ingredients.
-- The API route references this column when inserting ingredients with sections
-- (e.g. "Marinade", "Sauce"). Without this column the field is silently dropped.
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS group_name text;

-- Fix 2: Add tiktok to the source_type enum.
-- Migration 001 only defined (instagram, youtube, website).
-- The saved_sources route and type system reference tiktok, causing DB errors on insert.
ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'tiktok';
