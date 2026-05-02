-- GAL-238: drop the legacy 3-argument overload of create_recipe_with_children.
--
-- Migration 025 added a new 4-arg signature with `p_tags jsonb DEFAULT '[]'`,
-- which PostgreSQL treated as a new overload rather than a replacement. The
-- old 3-arg version still existed and would have been picked up by any RPC
-- call that omitted `p_tags` — bypassing tag writes silently. Drop it.

DROP FUNCTION IF EXISTS create_recipe_with_children(jsonb, jsonb, jsonb);
