-- Recompute historical cost_usd in ai_usage_logs after correcting pricing constants.
-- Gemini 2.5 Flash: $0.30 / 1M input, $2.50 / 1M output (was incorrectly set to 1.5 Flash rates)
-- Perplexity Sonar: $1.00 / 1M input, $1.00 / 1M output (unchanged)

UPDATE ai_usage_logs
SET cost_usd =
  (input_tokens * 0.30 / 1000000.0) +
  (output_tokens * 2.50 / 1000000.0)
WHERE model = 'gemini-2.5-flash'
  AND input_tokens IS NOT NULL
  AND output_tokens IS NOT NULL;

UPDATE ai_usage_logs
SET cost_usd =
  (input_tokens * 1.00 / 1000000.0) +
  (output_tokens * 1.00 / 1000000.0)
WHERE model = 'perplexity-sonar'
  AND input_tokens IS NOT NULL
  AND output_tokens IS NOT NULL;
