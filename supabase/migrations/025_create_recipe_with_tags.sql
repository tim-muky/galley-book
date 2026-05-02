-- GAL-238: extend create_recipe_with_children to also insert recipe_tags rows
-- in the same transaction. Replaces the function from migration 015.
--
-- p_tags shape: [{ "kind": "cuisine"|"type"|"season"|"ingredient", "value": "..." }, ...]

CREATE OR REPLACE FUNCTION create_recipe_with_children(
  p_recipe jsonb,
  p_ingredients jsonb,
  p_steps jsonb,
  p_tags jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $func$
DECLARE
  v_recipe_id uuid;
BEGIN
  INSERT INTO recipes (
    galley_id,
    created_by,
    name,
    description,
    servings,
    prep_time,
    season,
    type,
    source_url
  ) VALUES (
    (p_recipe->>'galley_id')::uuid,
    auth.uid(),
    p_recipe->>'name',
    nullif(p_recipe->>'description', ''),
    nullif(p_recipe->>'servings', '')::int,
    nullif(p_recipe->>'prep_time', '')::int,
    coalesce(nullif(p_recipe->>'season', '')::recipe_season, 'all_year'::recipe_season),
    nullif(p_recipe->>'type', '')::recipe_type,
    nullif(p_recipe->>'source_url', '')
  )
  RETURNING id INTO v_recipe_id;

  IF p_ingredients IS NOT NULL AND jsonb_array_length(p_ingredients) > 0 THEN
    INSERT INTO ingredients (recipe_id, name, amount, unit, group_name, sort_order)
    SELECT
      v_recipe_id,
      ing->>'name',
      nullif(ing->>'amount', '')::numeric,
      nullif(ing->>'unit', ''),
      nullif(ing->>'group_name', ''),
      coalesce((ing->>'sort_order')::int, 0)
    FROM jsonb_array_elements(p_ingredients) AS ing;
  END IF;

  IF p_steps IS NOT NULL AND jsonb_array_length(p_steps) > 0 THEN
    INSERT INTO preparation_steps (recipe_id, step_number, instruction)
    SELECT
      v_recipe_id,
      (s->>'step_number')::int,
      s->>'instruction'
    FROM jsonb_array_elements(p_steps) AS s;
  END IF;

  IF p_tags IS NOT NULL AND jsonb_array_length(p_tags) > 0 THEN
    INSERT INTO recipe_tags (recipe_id, kind, value)
    SELECT
      v_recipe_id,
      (t->>'kind')::tag_kind,
      trim(t->>'value')
    FROM jsonb_array_elements(p_tags) AS t
    WHERE length(trim(coalesce(t->>'value', ''))) > 0
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_recipe_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION create_recipe_with_children(jsonb, jsonb, jsonb, jsonb) TO authenticated;
