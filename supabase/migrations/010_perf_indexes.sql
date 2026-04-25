-- cook_next_history is queried by galley_id + recency + vote on every cook-next load
CREATE INDEX IF NOT EXISTS idx_cook_next_history_galley_shown
  ON cook_next_history(galley_id, shown_at DESC);

-- Compound index covering the library sort order (galley_id, soft-delete, recency)
CREATE INDEX IF NOT EXISTS idx_recipes_galley_deleted_updated
  ON recipes(galley_id, deleted_at, updated_at DESC);

-- Pre-aggregated vote summary — avoids fetching all vote rows when only count/avg is needed
CREATE OR REPLACE VIEW recipe_vote_summary AS
  SELECT
    recipe_id,
    COUNT(*)::int                          AS vote_count,
    ROUND(AVG(value)::numeric, 1)::float   AS vote_avg
  FROM votes
  GROUP BY recipe_id;
