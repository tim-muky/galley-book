-- GAL-238: tag system across four kinds (cuisine, type, season, ingredient).
-- Replaces the single-value `recipes.type` / `recipes.season` enum columns
-- with a uniform `recipe_tags(recipe_id, kind, value)` table that supports
-- multi-value per kind and free-text values.
--
-- Phase 1 keeps the legacy `recipes.type` and `recipes.season` columns intact
-- and backfills tags from them. Subsequent phases migrate readers (Library
-- filters, recipe detail UI) to read from recipe_tags; a final cleanup
-- migration will drop the legacy columns.

CREATE TYPE tag_kind AS ENUM ('cuisine', 'type', 'season', 'ingredient');

CREATE TABLE recipe_tags (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id  uuid        NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  kind       tag_kind    NOT NULL,
  value      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_tags_unique UNIQUE (recipe_id, kind, value),
  CONSTRAINT recipe_tags_value_not_blank CHECK (length(trim(value)) > 0)
);

CREATE INDEX recipe_tags_recipe_id_idx ON recipe_tags(recipe_id);
CREATE INDEX recipe_tags_kind_value_idx ON recipe_tags(kind, lower(value));

ALTER TABLE recipe_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "galley members can manage recipe tags"
  ON recipe_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM recipes r
      JOIN galley_members gm ON gm.galley_id = r.galley_id
      WHERE r.id = recipe_tags.recipe_id
        AND gm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM recipes r
      JOIN galley_members gm ON gm.galley_id = r.galley_id
      WHERE r.id = recipe_tags.recipe_id
        AND gm.user_id = auth.uid()
    )
  );

-- Backfill existing single-value type / season into recipe_tags.
INSERT INTO recipe_tags (recipe_id, kind, value)
SELECT id, 'type'::tag_kind, type::text
FROM recipes
WHERE type IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO recipe_tags (recipe_id, kind, value)
SELECT id, 'season'::tag_kind, season::text
FROM recipes
WHERE season IS NOT NULL
ON CONFLICT DO NOTHING;
