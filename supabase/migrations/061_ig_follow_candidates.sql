-- Instagram follow-candidate queue for the Social Media Management admin screen
-- (GAL-455). The IG Graph API can't follow accounts or list followers, so this
-- powers a compliant *assisted* flow: the admin works a curated queue and taps
-- Follow in-app. Seeded from the hand-curated 123-account list.
create table if not exists public.ig_follow_candidates (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique,
  display_name text,
  category text,
  region text,
  note text,
  follower_tier text,
  status text not null default 'suggested' check (status in ('suggested', 'followed', 'skipped')),
  created_at timestamptz not null default now(),
  actioned_at timestamptz
);

-- Admin-only: read/written via the service-role client (bypasses RLS). Enable
-- RLS with no public policies so it's never exposed through the Data API.
alter table public.ig_follow_candidates enable row level security;
