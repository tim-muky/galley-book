-- GAL-166: atomic recipe creation. Replaces the API route's three-step
-- insert (recipe → ingredients + steps in parallel → compensating delete on
-- failure) with a single transactional RPC. RLS still enforces galley
-- membership because the function runs with security invoker.
--
-- Note: uses $func$ instead of $$ because the Supabase dashboard's markdown
-- linkifier mangles bare $$ blocks containing schema-qualified identifiers.

create or replace function create_recipe_with_children(
  p_recipe jsonb,
  p_ingredients jsonb,
  p_steps jsonb
) returns uuid
language plpgsql
security invoker
as $func$
declare
  v_recipe_id uuid;
begin
  insert into recipes (
    galley_id,
    created_by,
    name,
    description,
    servings,
    prep_time,
    season,
    type,
    source_url
  ) values (
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
  returning id into v_recipe_id;

  if p_ingredients is not null and jsonb_array_length(p_ingredients) > 0 then
    insert into ingredients (recipe_id, name, amount, unit, group_name, sort_order)
    select
      v_recipe_id,
      ing->>'name',
      nullif(ing->>'amount', '')::numeric,
      nullif(ing->>'unit', ''),
      nullif(ing->>'group_name', ''),
      coalesce((ing->>'sort_order')::int, 0)
    from jsonb_array_elements(p_ingredients) as ing;
  end if;

  if p_steps is not null and jsonb_array_length(p_steps) > 0 then
    insert into preparation_steps (recipe_id, step_number, instruction)
    select
      v_recipe_id,
      (s->>'step_number')::int,
      s->>'instruction'
    from jsonb_array_elements(p_steps) as s;
  end if;

  return v_recipe_id;
end;
$func$;

grant execute on function create_recipe_with_children(jsonb, jsonb, jsonb) to authenticated;
