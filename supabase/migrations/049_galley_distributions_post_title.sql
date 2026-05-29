-- GAL-400: editable marketing post title, separate from the galley name
-- (which carries the "— KW XX" suffix). Defaults to an AI-generated catchy
-- headline; drives the carousel cover + IG caption opener.
alter table public.galley_distributions
  add column if not exists post_title text;
