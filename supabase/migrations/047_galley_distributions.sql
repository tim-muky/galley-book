-- GAL-390/391/392: galley_distributions — Campaign Studio distribution layer.
-- After a galley_run publishes a public galley, the admin generates marketing
-- assets (carousel, ad creative) and pushes them out to Instagram + Meta Ads.
-- This table tracks the generated assets and the status of each channel.

create type ig_post_status as enum ('pending', 'published', 'failed');
create type meta_push_status as enum ('none', 'pushed', 'failed');

create table public.galley_distributions (
  id                 uuid primary key default gen_random_uuid(),
  galley_id          uuid not null references public.galleys(id) on delete cascade,
  run_id             uuid references public.galley_runs(id) on delete set null,

  -- Generated assets (GAL-390). Paths are relative to the public recipe-photos
  -- bucket, under campaign-assets/<galleyId>/...
  carousel_paths     jsonb not null default '[]'::jsonb,  -- ["campaign-assets/<g>/slide-0.png", ...]
  video_path         text,                                 -- nullable; video may be deferred (GAL-390b)
  -- Array of { format: 'problem'|'hero', headline, primaryText, imagePath }
  ad_variants        jsonb not null default '[]'::jsonb,

  -- Captions for the IG post (GAL-392), editable per-galley with DE/EN variants
  caption_de         text,
  caption_en         text,

  -- Instagram publish state (GAL-392)
  ig_post_id         text,
  ig_status          ig_post_status not null default 'pending',
  ig_error           text,

  -- Meta Marketing API push state (GAL-391)
  meta_creative_ids  jsonb not null default '[]'::jsonb,   -- [{ format, creativeId, adId }]
  meta_status        meta_push_status not null default 'none',
  meta_error         text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index galley_distributions_galley_id on public.galley_distributions (galley_id);
create index galley_distributions_run_id on public.galley_distributions (run_id);
create index galley_distributions_created_at_desc on public.galley_distributions (created_at desc);

create trigger galley_distributions_set_updated_at
  before update on public.galley_distributions
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- RLS — admin-only (mirrors galley_runs in 046)
-- ============================================================
alter table public.galley_distributions enable row level security;

create policy "Admins read all galley distributions"
  on public.galley_distributions for select
  using ((select is_admin from public.users where id = auth.uid()) = true);

create policy "Admins insert galley distributions"
  on public.galley_distributions for insert
  with check ((select is_admin from public.users where id = auth.uid()) = true);

create policy "Admins update galley distributions"
  on public.galley_distributions for update
  using ((select is_admin from public.users where id = auth.uid()) = true)
  with check ((select is_admin from public.users where id = auth.uid()) = true);

create policy "Admins delete galley distributions"
  on public.galley_distributions for delete
  using ((select is_admin from public.users where id = auth.uid()) = true);
