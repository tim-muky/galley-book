CREATE VIEW recipe_vote_summary AS
  SELECT
    recipe_id,
    COUNT(*)                              AS vote_count,
    ROUND(AVG(value)::numeric, 1)         AS vote_avg
  FROM votes
  GROUP BY recipe_id;
