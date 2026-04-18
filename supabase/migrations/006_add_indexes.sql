-- Add indexes on foreign key columns that are filtered/joined on every request.
-- PostgreSQL does not auto-index FK columns; without these, queries do full table scans.

-- Core recipe queries (library load, every page)
CREATE INDEX IF NOT EXISTS idx_recipes_galley_id ON recipes(galley_id);
-- Compound: filters out soft-deleted rows in a single index scan
CREATE INDEX IF NOT EXISTS idx_recipes_galley_deleted ON recipes(galley_id, deleted_at);

-- RLS policy checks run on every authenticated query for these tables
CREATE INDEX IF NOT EXISTS idx_galley_members_galley_id ON galley_members(galley_id);
CREATE INDEX IF NOT EXISTS idx_galley_members_user_id ON galley_members(user_id);

-- Recipe detail fetches (ingredients, steps, photos load per recipe view)
CREATE INDEX IF NOT EXISTS idx_ingredients_recipe_id ON ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_preparation_steps_recipe_id ON preparation_steps(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_photos_recipe_id ON recipe_photos(recipe_id);

-- Votes aggregation on library and detail pages
CREATE INDEX IF NOT EXISTS idx_votes_recipe_id ON votes(recipe_id);

-- Discovery and recommendation queries
CREATE INDEX IF NOT EXISTS idx_saved_sources_galley_id ON saved_sources(galley_id);
CREATE INDEX IF NOT EXISTS idx_discover_memory_galley_id ON discover_memory(galley_id);
CREATE INDEX IF NOT EXISTS idx_cook_next_list_galley_id ON cook_next_list(galley_id);
