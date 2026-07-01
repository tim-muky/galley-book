-- 066 — native comment → DM automation (GAL-433 follow-up).
--
-- The default IG caption tells viewers to comment a trigger word (REZEPT /
-- RECIPE) to get the recipe DMed. Until now that promise was fulfilled only if
-- an admin wired the trigger into ManyChat / IG native auto-reply by hand. This
-- migration backs the in-app automation: an Instagram `comments` webhook
-- (app/api/webhooks/instagram) matches the trigger against the posted carousel
-- and sends the stored dm_reply as a private reply.
--
-- 1) ig_posted_locale — which caption language was actually posted, so the
--    webhook DMs dm_reply_de vs dm_reply_en to match. Set when we publish to IG.
alter table public.galley_distributions
  add column if not exists ig_posted_locale text;

-- 2) comment_dm_log — idempotency + conversion metrics. Meta delivers webhooks
--    at-least-once, so the comment_id primary key is the dedupe guard: the
--    webhook claims a row before sending and skips if the insert conflicts.
--    Service-role only (written by the webhook via the service client, which
--    bypasses RLS). No client/anon access — RLS on, no policies.
create table if not exists public.comment_dm_log (
  comment_id text primary key,
  distribution_id uuid references public.galley_distributions(id) on delete cascade,
  galley_id uuid,
  media_id text,
  commenter_id text,
  commenter_username text,
  locale text,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists comment_dm_log_distribution_idx
  on public.comment_dm_log (distribution_id);

alter table public.comment_dm_log enable row level security;
