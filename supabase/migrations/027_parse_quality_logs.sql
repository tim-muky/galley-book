create table parse_quality_logs (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null    default now(),
  user_id       uuid        references auth.users(id),
  source_url    text        not null,
  platform      text        not null,   -- instagram | youtube | tiktok | website
  parsed_via    text,                   -- instagram_caption | instagram_perplexity | etc.
  success       boolean     not null    default true,
  missing_fields text[]     not null    default '{}',
  error_message text,
  recipe_name   text
);

-- Service role bypasses RLS; no user-facing policies needed (admin-only table).
alter table parse_quality_logs enable row level security;
