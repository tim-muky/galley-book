-- Invite tokens for joining a galley via shareable link
create table galley_invites (
  id         uuid primary key default gen_random_uuid(),
  token      uuid unique not null default gen_random_uuid(),
  galley_id  uuid not null references galleys(id) on delete cascade,
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table galley_invites enable row level security;

-- Galley members can create invites for their galley
create policy "galley members can create invites"
  on galley_invites for insert
  with check (is_galley_member(galley_id));

-- Service client is used for reads (join page, token validation)
-- No SELECT RLS needed — reads go through service role
