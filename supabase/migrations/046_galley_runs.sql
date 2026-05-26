-- GAL-386: galley_runs — Campaign Studio "Galley of the Week" pipeline state.
-- A run goes brief → candidates → image curation → expansion → published galley.
-- State lives here so admins can close the browser and resume curation later.

create type galley_run_status as enum (
  'candidates_pending',  -- LLM generating 10 candidates
  'candidates_ready',    -- waiting on human curation (step 1)
  'images_pending',      -- generating watercolor images for kept candidates
  'images_ready',        -- waiting on human curation (step 2)
  'expanding',           -- generating full recipes
  'published',           -- public galley exists
  'failed'               -- terminal error; see error column
);

create table public.galley_runs (
  id                   uuid primary key default gen_random_uuid(),
  created_by           uuid not null references public.users(id) on delete cascade,
  status               galley_run_status not null default 'candidates_pending',
  brief                jsonb not null,
  -- Array of { name, oneLiner, tags[], keep, imagePath?, imagePrompt?, fullRecipe? }
  candidates           jsonb not null default '[]'::jsonb,
  published_galley_id  uuid references public.galleys(id) on delete set null,
  error                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index galley_runs_created_by on public.galley_runs (created_by);
create index galley_runs_status on public.galley_runs (status);
create index galley_runs_created_at_desc on public.galley_runs (created_at desc);

create trigger galley_runs_set_updated_at
  before update on public.galley_runs
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- RLS — admin-only
-- ============================================================
alter table public.galley_runs enable row level security;

create policy "Admins read all galley runs"
  on public.galley_runs for select
  using ((select is_admin from public.users where id = auth.uid()) = true);

create policy "Admins insert galley runs"
  on public.galley_runs for insert
  with check ((select is_admin from public.users where id = auth.uid()) = true);

create policy "Admins update galley runs"
  on public.galley_runs for update
  using ((select is_admin from public.users where id = auth.uid()) = true)
  with check ((select is_admin from public.users where id = auth.uid()) = true);

create policy "Admins delete galley runs"
  on public.galley_runs for delete
  using ((select is_admin from public.users where id = auth.uid()) = true);
