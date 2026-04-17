-- AI usage logging for admin cost + activity monitoring
CREATE TABLE ai_usage_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  operation     text        NOT NULL, -- 'parse_link' | 'parse_image' | 'recommendation'
  model         text        NOT NULL, -- 'gemini-2.5-flash' | 'perplexity-sonar'
  input_tokens  integer,
  output_tokens integer,
  cost_usd      numeric(10, 6),
  duration_ms   integer,
  success       boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- No user-facing RLS policies — only service role (admin) can access this table
