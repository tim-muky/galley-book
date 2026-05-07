-- GAL-303 + GAL-304: collapse two Library hot-path bottlenecks into single
-- Postgres calls.
--
-- 1. recipes_matching_tag_filters: replaces N sequential Supabase queries
--    (one per active filter kind) + JS-side intersection in
--    resolveFilteredRecipeIds. AND across kinds, OR within a kind.
--
-- 2. available_recipe_tags: replaces a "fetch every (kind, value) row in the
--    galley and count in JS" pass in loadAvailableTags. Returns ~20-50 rows
--    instead of every tag row.
--
-- Both run as SECURITY INVOKER so the existing RLS on recipes/recipe_tags
-- still gates visibility — passing someone else's galley_id returns nothing.

CREATE OR REPLACE FUNCTION recipes_matching_tag_filters(
  p_galley_id uuid,
  p_filters jsonb
) RETURNS TABLE (recipe_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $func$
  WITH f AS (
    SELECT kind, jsonb_array_elements_text(value) AS value
    FROM jsonb_each(p_filters) AS t(kind, value)
    WHERE jsonb_array_length(value) > 0
  ),
  active AS (
    SELECT count(DISTINCT kind) AS n FROM f
  ),
  matches AS (
    SELECT rt.recipe_id, rt.kind
    FROM recipe_tags rt
    JOIN recipes r ON r.id = rt.recipe_id
    JOIN f ON f.kind = rt.kind::text AND f.value = rt.value
    WHERE r.galley_id = p_galley_id
      AND r.deleted_at IS NULL
  )
  SELECT m.recipe_id
  FROM matches m, active
  GROUP BY m.recipe_id, active.n
  HAVING count(DISTINCT m.kind) = active.n;
$func$;

CREATE OR REPLACE FUNCTION available_recipe_tags(p_galley_id uuid)
RETURNS TABLE (kind text, value text, count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $func$
  SELECT rt.kind::text, rt.value, count(DISTINCT rt.recipe_id) AS count
  FROM recipe_tags rt
  JOIN recipes r ON r.id = rt.recipe_id
  WHERE r.galley_id = p_galley_id
    AND r.deleted_at IS NULL
  GROUP BY rt.kind, rt.value
  ORDER BY count(DISTINCT rt.recipe_id) DESC, rt.value ASC;
$func$;
