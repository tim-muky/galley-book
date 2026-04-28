-- GAL-168: speed up the library search box.
-- ilike("%query%") with leading wildcards can't use a btree index and forces a
-- sequential scan. A GIN trigram index lets Postgres use the index for the
-- exact same ILIKE expression — no query rewrite needed.

create extension if not exists pg_trgm;

create index if not exists recipes_name_trgm_idx
  on public.recipes using gin (name gin_trgm_ops);
