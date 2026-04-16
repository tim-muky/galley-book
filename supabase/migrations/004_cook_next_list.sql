-- Cook Next list: galley-shared queue of recipes to cook
CREATE TABLE cook_next_list (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  galley_id  uuid        NOT NULL REFERENCES galleys(id)      ON DELETE CASCADE,
  recipe_id  uuid        NOT NULL REFERENCES recipes(id)      ON DELETE CASCADE,
  added_by   uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cook_next_list_unique_recipe UNIQUE (galley_id, recipe_id)
);

ALTER TABLE cook_next_list ENABLE ROW LEVEL SECURITY;

-- Galley members can read and write their galley's list
CREATE POLICY "galley members can manage cook next list"
  ON cook_next_list
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM galley_members
      WHERE galley_members.galley_id = cook_next_list.galley_id
        AND galley_members.user_id   = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM galley_members
      WHERE galley_members.galley_id = cook_next_list.galley_id
        AND galley_members.user_id   = auth.uid()
    )
  );
