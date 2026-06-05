-- GAL-436: tag organic IG posts with the same taxonomy as paid creatives so the
-- learning loop can attribute organic performance (the channel that carries early
-- growth) — not just Meta ads. Mirrors the paid creative_attributes shape, keyed
-- by ig_post_id instead of a Meta ad id.
--
-- Written/read server-side via the service role only (no client access), so RLS
-- is enabled with no public policy. Explicit grants are still added per the
-- 2026-10-30 Data API requirement that new public tables declare grants.

create table if not exists public.organic_attributes (
  ig_post_id      text primary key,
  distribution_id uuid references public.galley_distributions(id) on delete set null,
  galley_id       uuid references public.galleys(id) on delete set null,
  angle           text not null,            -- problem | hero | comment
  hook_type       text not null,            -- pain-point | appetite | curiosity
  cta             text not null,            -- import | save-to-galley | comment-dm
  media_format    text not null,            -- carousel | video | single
  language        text not null,            -- de | en
  placement       text not null default 'organic-ig',
  post_title      text,
  created_at      timestamptz not null default now()
);

create index if not exists organic_attributes_galley_idx on public.organic_attributes (galley_id);
create index if not exists organic_attributes_cta_idx on public.organic_attributes (cta);

alter table public.organic_attributes enable row level security;
-- No policies: clients get nothing; the service role (used by the tagging path
-- and the dashboard query) bypasses RLS.

grant select on public.organic_attributes to authenticated;
grant all on public.organic_attributes to service_role;
